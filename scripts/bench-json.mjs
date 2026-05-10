import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parseTree } from 'jsonc-parser';

const DEFAULT_SAMPLE_FILES = [
  'json/sample-5mb.json',
  'json/sample-10mb.json',
  'json/sample-15mb.json',
  'json/sample-20mb.json',
];

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

function buildViewerDataStats(text) {
  const lineStarts = [0];
  const regions = [];
  const stackClose = [];
  const stackRegionIndex = [];
  let line = 1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '\n') {
      line += 1;
      lineStarts.push(index + 1);
      continue;
    }

    if (char === '{' || char === '[') {
      stackClose.push(char === '{' ? '}' : ']');
      stackRegionIndex.push(regions.length);
      regions.push({
        startLine: line,
        endLine: line,
      });
      continue;
    }

    if (char === '}' || char === ']') {
      const expectedClose = stackClose.pop();
      const regionIndex = stackRegionIndex.pop();
      if (expectedClose !== char || typeof regionIndex !== 'number' || !regions[regionIndex]) {
        continue;
      }

      regions[regionIndex].endLine = line;
    }
  }

  return {
    lineCount: lineStarts.length,
    regionCount: regions.filter((region) => region.startLine < region.endLine).length,
  };
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
  const viewerResult = measure('viewer-index', () => buildViewerDataStats(formattedText));
  const rawTreeResult = measure('rawTree', () => parseTree(rawText));
  const formattedTreeResult = measure('formattedTree', () => parseTree(formattedText));

  return {
    filePath: absolutePath,
    fileName: path.basename(absolutePath),
    readFileMs: readEnd - readStart,
    parseMs: parseResult.ms,
    stringifyMs: stringifyResult.ms,
    totalFormatMs: parseResult.ms + stringifyResult.ms,
    viewerIndexMs: viewerResult.ms,
    viewerLineCount: viewerResult.value.lineCount,
    viewerRegionCount: viewerResult.value.regionCount,
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
    { stage: 'viewer-index', duration: formatDuration(result.viewerIndexMs) },
    { stage: 'raw-tree', duration: formatDuration(result.rawTreeMs) },
    { stage: 'formatted-tree', duration: formatDuration(result.formattedTreeMs) },
  ]);
  console.log(`Viewer lines: ${result.viewerLineCount.toLocaleString()}`);
  console.log(`Viewer regions: ${result.viewerRegionCount.toLocaleString()}`);
}

async function getDefaultSampleFiles() {
  const existing = [];

  for (const filePath of DEFAULT_SAMPLE_FILES) {
    try {
      await fs.access(path.resolve(filePath));
      existing.push(filePath);
    } catch {
      // Missing samples are skipped so the command still works in fresh clones.
    }
  }

  return existing;
}

async function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  const fileArgs = args.filter((arg) => arg !== '--json' && arg !== '--samples');
  const shouldUseSamples = args.includes('--samples') || fileArgs.length === 0;
  const filesToBench = shouldUseSamples && fileArgs.length === 0
    ? await getDefaultSampleFiles()
    : fileArgs;

  if (filesToBench.length === 0) {
    console.error('Usage: npm run bench -- [file.json ...] [--samples] [--json]');
    console.error('No benchmark files were provided and no default json/sample-*.json files were found.');
    process.exitCode = 1;
    return;
  }

  const results = [];

  for (const filePath of filesToBench) {
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
      viewerIndex: formatDuration(result.viewerIndexMs),
      viewerLines: result.viewerLineCount.toLocaleString(),
      viewerRegions: result.viewerRegionCount.toLocaleString(),
    })));
  }
}

export {
  benchFile,
  formatBytes,
  formatDuration,
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
