import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';

const DEFAULT_SAMPLE_FILES = [
  'json/sample-2mb.json',
  'json/sample-5mb.json',
  'json/sample-10mb.json',
  'json/sample-15mb.json',
  'json/sample-20mb.json',
];
const RIGHT_SEARCH_BATCH_SIZE = 2000;

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

function findLiteralSearchBatch(text, query, startOffset = 0, maxResults = RIGHT_SEARCH_BATCH_SIZE) {
  let count = 0;
  let offset = Math.max(0, startOffset);

  while (offset < text.length) {
    const next = text.indexOf(query, offset);
    if (next === -1) {
      return {
        count,
        hasMore: false,
        nextStartOffset: offset,
      };
    }

    if (count >= maxResults) {
      return {
        count,
        hasMore: true,
        nextStartOffset: next,
      };
    }

    count += 1;
    offset = next + query.length;
  }

  return {
    count,
    hasMore: false,
    nextStartOffset: offset,
  };
}

function getRightSearchQuery(formattedText) {
  return formattedText.includes('requestId') ? 'requestId' : '"id"';
}

function readFirstRequestValue(formattedText, formattedTree) {
  const offset = formattedText.indexOf('"req-');
  if (offset === -1 || !formattedTree) {
    return null;
  }

  const location = getLocation(formattedText, offset);
  const node = findNodeAtLocation(formattedTree, location.path);
  if (!node) {
    return null;
  }

  return {
    end: node.offset + node.length,
    literal: formattedText.slice(node.offset, node.offset + node.length),
    path: location.path,
    start: node.offset,
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
  const rightSearchQuery = getRightSearchQuery(formattedText);
  const rightSearchBatchResult = measure('rightSearchBatch', () => (
    findLiteralSearchBatch(formattedText, rightSearchQuery)
  ));
  const rightSearchLoadMoreResult = measure('rightSearchLoadMore', () => (
    rightSearchBatchResult.value.hasMore
      ? findLiteralSearchBatch(formattedText, rightSearchQuery, rightSearchBatchResult.value.nextStartOffset)
      : { count: 0, hasMore: false, nextStartOffset: rightSearchBatchResult.value.nextStartOffset }
  ));
  const nodeValueReadResult = measure('nodeValueRead', () => (
    readFirstRequestValue(formattedText, formattedTreeResult.value)
  ));
  const nodeEditPatchResult = measure('nodeEditPatch', () => {
    const node = nodeValueReadResult.value;
    if (!node) {
      return null;
    }

    const nextLiteral = JSON.stringify('req-benchmark-updated');
    return `${formattedText.slice(0, node.start)}${nextLiteral}${formattedText.slice(node.end)}`;
  });

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
    rightSearchBatchMs: rightSearchBatchResult.ms,
    rightSearchBatchCount: rightSearchBatchResult.value.count,
    rightSearchLoadMoreMs: rightSearchLoadMoreResult.ms,
    rightSearchLoadMoreCount: rightSearchLoadMoreResult.value.count,
    nodeValueReadMs: nodeValueReadResult.ms,
    nodeEditPatchMs: nodeEditPatchResult.ms,
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
    { stage: `right-search-${result.rightSearchBatchCount}`, duration: formatDuration(result.rightSearchBatchMs) },
    { stage: `right-search-more-${result.rightSearchLoadMoreCount}`, duration: formatDuration(result.rightSearchLoadMoreMs) },
    { stage: 'node-value-read', duration: formatDuration(result.nodeValueReadMs) },
    { stage: 'node-edit-patch', duration: formatDuration(result.nodeEditPatchMs) },
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
      rightSearch: formatDuration(result.rightSearchBatchMs),
      rightSearchMore: formatDuration(result.rightSearchLoadMoreMs),
      nodeRead: formatDuration(result.nodeValueReadMs),
      nodePatch: formatDuration(result.nodeEditPatchMs),
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
