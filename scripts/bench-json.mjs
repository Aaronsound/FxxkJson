import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { parseTree } from 'jsonc-parser';

function formatDuration(value) {
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

function formatBytes(value) {
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[index]}`;
}

function measure(label, fn) {
  const start = performance.now();
  const value = fn();
  const end = performance.now();

  return {
    label,
    value,
    ms: end - start,
  };
}

async function benchFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const readStart = performance.now();
  const rawText = await fs.readFile(absolutePath, 'utf8');
  const readEnd = performance.now();

  const rawBytes = Buffer.byteLength(rawText, 'utf8');
  const parseResult = measure('parse', () => JSON.parse(rawText));
  const stringifyResult = measure('stringify', () => JSON.stringify(parseResult.value, null, 2));
  const formattedText = stringifyResult.value;
  const formattedBytes = Buffer.byteLength(formattedText, 'utf8');
  const rawTreeResult = measure('rawTree', () => parseTree(rawText));
  const formattedTreeResult = measure('formattedTree', () => parseTree(formattedText));

  return {
    filePath: absolutePath,
    fileName: path.basename(absolutePath),
    readFileMs: readEnd - readStart,
    parseMs: parseResult.ms,
    stringifyMs: stringifyResult.ms,
    totalFormatMs: parseResult.ms + stringifyResult.ms,
    rawTreeMs: rawTreeResult.ms,
    formattedTreeMs: formattedTreeResult.ms,
    rawBytes,
    formattedBytes,
  };
}

function printResult(result) {
  console.log(`\nFile: ${result.fileName}`);
  console.log(`Path: ${result.filePath}`);
  console.log(`Raw size: ${formatBytes(result.rawBytes)}`);
  console.log(`Formatted size: ${formatBytes(result.formattedBytes)}`);
  console.table([
    { stage: 'read-file', duration: formatDuration(result.readFileMs) },
    { stage: 'parse', duration: formatDuration(result.parseMs) },
    { stage: 'stringify', duration: formatDuration(result.stringifyMs) },
    { stage: 'format-total', duration: formatDuration(result.totalFormatMs) },
    { stage: 'raw-tree', duration: formatDuration(result.rawTreeMs) },
    { stage: 'formatted-tree', duration: formatDuration(result.formattedTreeMs) },
  ]);
}

async function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  const fileArgs = args.filter((arg) => arg !== '--json');

  if (fileArgs.length === 0) {
    console.error('Usage: npm run bench -- <file.json> [more files...] [--json]');
    process.exitCode = 1;
    return;
  }

  const results = [];

  for (const filePath of fileArgs) {
    try {
      const result = await benchFile(filePath);
      results.push(result);
    } catch (error) {
      console.error(`\nFailed: ${filePath}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }

  if (outputJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  results.forEach(printResult);

  if (results.length > 1) {
    console.log('\nSummary');
    console.table(results.map((result) => ({
      file: result.fileName,
      rawSize: formatBytes(result.rawBytes),
      formattedSize: formatBytes(result.formattedBytes),
      readFile: formatDuration(result.readFileMs),
      formatTotal: formatDuration(result.totalFormatMs),
      rawTree: formatDuration(result.rawTreeMs),
      formattedTree: formatDuration(result.formattedTreeMs),
    })));
  }
}

main();
