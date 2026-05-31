import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseTree } from 'jsonc-parser';
import {
  buildViewerDataStats,
  findLiteralSearchBatch,
  getRightSearchQuery,
  measure,
  readFirstRequestValue,
  replaceLiteralMatches,
  replaceRegexMatches,
} from './bench-json-metrics.mjs';

export const DEFAULT_SAMPLE_FILES = [
  'json/sample-2mb.json',
  'json/sample-5mb.json',
  'json/sample-10mb.json',
  'json/sample-15mb.json',
  'json/sample-20mb.json',
];

export async function benchFile(filePath) {
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
  const rightSearchBatchResult = measure('rightSearchBatch', () =>
    findLiteralSearchBatch(formattedText, rightSearchQuery)
  );
  const rightSearchLoadMoreResult = measure('rightSearchLoadMore', () =>
    rightSearchBatchResult.value.hasMore
      ? findLiteralSearchBatch(formattedText, rightSearchQuery, rightSearchBatchResult.value.nextStartOffset)
      : { count: 0, hasMore: false, nextStartOffset: rightSearchBatchResult.value.nextStartOffset }
  );
  const leftSearchQuery = getRightSearchQuery(rawText);
  const leftSearchBatchResult = measure('leftSearchBatch', () => findLiteralSearchBatch(rawText, leftSearchQuery));
  const leftSearchLoadMoreResult = measure('leftSearchLoadMore', () =>
    leftSearchBatchResult.value.hasMore
      ? findLiteralSearchBatch(rawText, leftSearchQuery, leftSearchBatchResult.value.nextStartOffset)
      : { count: 0, hasMore: false, nextStartOffset: leftSearchBatchResult.value.nextStartOffset }
  );
  const leftReplaceAllResult = measure('leftReplaceAll', () =>
    replaceLiteralMatches(rawText, leftSearchQuery, `${leftSearchQuery}-replaced`)
  );
  const leftRegexReplaceAllResult = measure('leftRegexReplaceAll', () =>
    replaceRegexMatches(rawText, 'req-([a-z]+)-(\\d+)', 'trace-$1-$2')
  );
  const nodeValueReadResult = measure('nodeValueRead', () =>
    readFirstRequestValue(formattedText, formattedTreeResult.value)
  );
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
    leftSearchBatchMs: leftSearchBatchResult.ms,
    leftSearchBatchCount: leftSearchBatchResult.value.count,
    leftSearchLoadMoreMs: leftSearchLoadMoreResult.ms,
    leftSearchLoadMoreCount: leftSearchLoadMoreResult.value.count,
    leftReplaceAllMs: leftReplaceAllResult.ms,
    leftRegexReplaceAllMs: leftRegexReplaceAllResult.ms,
    nodeValueReadMs: nodeValueReadResult.ms,
    nodeEditPatchMs: nodeEditPatchResult.ms,
    rawBytes,
    formattedBytes,
  };
}

export async function getDefaultSampleFiles() {
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
