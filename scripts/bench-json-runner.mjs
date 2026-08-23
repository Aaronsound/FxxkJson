import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseTree } from 'jsonc-parser';
import {
  buildFoldAllStats,
  buildRawViewerDataStats,
  buildViewerDataStats,
  buildWrapLayoutStats,
  countTextLines,
  findCaseInsensitiveSearchBatch,
  findLiteralSearchBatch,
  getRightSearchQuery,
  measure,
  measureDocumentMetrics,
  readFirstRequestValue,
  readFirstRequestValueStreaming,
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
  const uiMetricRescanResult = measure('legacyUiMetricRescan', () => ({
    raw: measureDocumentMetrics(rawText),
    formatted: measureDocumentMetrics(formattedText),
  }));
  const rawViewerResult = measure('raw-viewer-index', () => buildRawViewerDataStats(rawText));
  const formattedLineCount = countTextLines(formattedText);
  const viewerResult = measure('viewer-index', () => buildViewerDataStats(formattedText, formattedLineCount));
  const foldAllResult = measure('fold-all-index', () => buildFoldAllStats(viewerResult.value.regions));
  const wrapLayoutResult = measure('wrap-layout', () =>
    buildWrapLayoutStats(formattedText, viewerResult.value.lineStarts, viewerResult.value.lineCount)
  );
  const rawTreeResult = measure('rawTree', () => parseTree(rawText));
  const formattedTreeResult = measure('formattedTree', () => parseTree(formattedText));
  const rightSearchQuery = getRightSearchQuery(formattedText);
  const rightSearchBatchResult = measure('rightSearchBatch', () =>
    findLiteralSearchBatch(formattedText, rightSearchQuery)
  );
  const caseInsensitiveSearchBatchResult = measure('caseInsensitiveSearchBatch', () =>
    findCaseInsensitiveSearchBatch(formattedText, rightSearchQuery.toUpperCase())
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
  const streamingNodeReadResult = measure('streamingNodeRead', () =>
    readFirstRequestValueStreaming(rawText, formattedText)
  );
  const nodeEditPatchResult = measure('nodeEditPatch', () => {
    const node = nodeValueReadResult.value;
    if (!node) {
      return null;
    }

    const nextLiteral = JSON.stringify('req-benchmark-updated');
    return `${formattedText.slice(0, node.start)}${nextLiteral}${formattedText.slice(node.end)}`;
  });
  const nodeEditViewerResult = measure('nodeEditViewerIndex', () =>
    nodeEditPatchResult.value
      ? buildViewerDataStats(nodeEditPatchResult.value, viewerResult.value.lineCount)
      : { buildWorkingBytes: 0 }
  );

  return {
    filePath: absolutePath,
    fileName: path.basename(absolutePath),
    readFileMs: readEnd - readStart,
    parseMs: parseResult.ms,
    stringifyMs: stringifyResult.ms,
    totalFormatMs: parseResult.ms + stringifyResult.ms,
    viewerIndexMs: viewerResult.ms,
    viewerIndexBytes: viewerResult.value.indexBytes,
    viewerIndexWorkingBytes: viewerResult.value.buildWorkingBytes,
    viewerLineCount: viewerResult.value.lineCount,
    viewerRegionCount: viewerResult.value.regionCount,
    viewerRegionIndexBytes: viewerResult.value.regionIndexBytes,
    viewerWorkerRetainedBytes: viewerResult.value.lineStarts.byteLength,
    viewerWorkerBytesAvoided: viewerResult.value.regionIndexBytes,
    foldAllIntervalsMs: foldAllResult.ms,
    foldAllIntervalCount: foldAllResult.value.intervalCount,
    foldAllVisitedRegionCount: foldAllResult.value.visitedRegionCount,
    wrapLayoutMs: wrapLayoutResult.ms,
    wrapLayoutBytes: wrapLayoutResult.value.indexBytes,
    wrapLongRowCount: wrapLayoutResult.value.longRowCount,
    rawTreeMs: rawTreeResult.ms,
    formattedTreeMs: formattedTreeResult.ms,
    structureTreeWarmupAvoidedMs: rawTreeResult.ms + formattedTreeResult.ms,
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
    streamingNodeReadMs: streamingNodeReadResult.ms,
    nodeEditPatchMs: nodeEditPatchResult.ms,
    nodeEditViewerIndexMs: nodeEditViewerResult.ms,
    nodeEditViewerWorkingBytes: nodeEditViewerResult.value.buildWorkingBytes,
    nodeSaveTransferBytes: rawBytes + formattedBytes,
    uiMetricRescanAvoidedMs: uiMetricRescanResult.ms,
    rawBytes,
    rawViewerIndexMs: rawViewerResult.ms,
    rawViewerIndexBytes: rawViewerResult.value.indexBytes,
    rawViewerLegacyIndexBytes: rawViewerResult.value.legacyIndexBytes,
    rawViewerRowCount: rawViewerResult.value.rowCount,
    rawViewerWorkingBytes: rawViewerResult.value.workingBytes,
    caseInsensitiveSearchBatchMs: caseInsensitiveSearchBatchResult.ms,
    caseInsensitiveSearchBatchCount: caseInsensitiveSearchBatchResult.value.count,
    normalizedSearchCopyCharsAvoided: formattedText.length,
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
