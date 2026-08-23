import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseTree } from 'jsonc-parser';
import {
  buildFoldAllStats,
  buildRawViewerDataStats,
  buildTokenizerSampleLines,
  buildViewerDataStats,
  buildWrapLayoutStats,
  countTextLines,
  findCaseInsensitiveSearchBatch,
  findLegacyLineAwareLiteralBatch,
  findLiteralSearchBatch,
  findOptimizedLineAwareLiteralBatch,
  getRightSearchQuery,
  measure,
  measureDocumentMetrics,
  measureRepeated,
  readFirstRequestValue,
  readFirstRequestValueStreaming,
  rebuildFoldedWrapLayoutStats,
  replaceLegacyExactMatches,
  replaceLiteralMatches,
  replaceRegexMatches,
  projectFoldedWrapLayoutStats,
  tokenizeLegacySampleLines,
  tokenizeOptimizedSampleLines,
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
  const uiMetricRescanResult = measure('legacyUiMetricRescan', () => {
    const raw = measure('rawMetricRescan', () => measureDocumentMetrics(rawText));
    const formatted = measure('formattedMetricRescan', () => measureDocumentMetrics(formattedText));
    return { formatted: formatted.value, formattedMs: formatted.ms, raw: raw.value, rawMs: raw.ms };
  });
  const formattedIdentityCopy = Buffer.from(formattedText).toString('utf8');
  const identityComparisonResult = measureRepeated(
    'identityComparison',
    5,
    () => formattedText === formattedIdentityCopy
  );
  const rawViewerResult = measure('raw-viewer-index', () => buildRawViewerDataStats(rawText));
  const formattedLineCount = countTextLines(formattedText);
  const viewerResult = measure('viewer-index', () => buildViewerDataStats(formattedText, formattedLineCount));
  let uniqueRegionStartLineCount = 0;
  let previousRegionStartLine = -1;
  for (const startLine of viewerResult.value.regions.startLines) {
    if (startLine !== previousRegionStartLine) {
      uniqueRegionStartLineCount += 1;
      previousRegionStartLine = startLine;
    }
  }
  const foldAllResult = measure('fold-all-index', () => buildFoldAllStats(viewerResult.value.regions));
  const wrapLayoutResult = measure('wrap-layout', () =>
    buildWrapLayoutStats(formattedText, viewerResult.value.lineStarts, viewerResult.value.lineCount)
  );
  const hiddenWrapStartLine = Math.min(10_000, Math.max(1, viewerResult.value.lineCount - 20));
  const hiddenWrapEndLine = Math.min(viewerResult.value.lineCount, hiddenWrapStartLine + 19);
  const legacyWrapFoldUpdateResult = measureRepeated('legacyWrapFoldUpdate', 3, () =>
    rebuildFoldedWrapLayoutStats(
      formattedText,
      viewerResult.value.lineStarts,
      viewerResult.value.lineCount,
      hiddenWrapStartLine,
      hiddenWrapEndLine
    )
  );
  const optimizedWrapFoldUpdateResult = measureRepeated('optimizedWrapFoldUpdate', 20, () =>
    projectFoldedWrapLayoutStats(wrapLayoutResult.value.longRowIndexes, hiddenWrapStartLine, hiddenWrapEndLine)
  );
  if (
    legacyWrapFoldUpdateResult.value.longRowCount !== optimizedWrapFoldUpdateResult.value.longRowCount ||
    legacyWrapFoldUpdateResult.value.checksum !== optimizedWrapFoldUpdateResult.value.checksum
  ) {
    throw new Error(`Wrap fold benchmark implementations diverged for ${absolutePath}`);
  }
  const tokenizerSampleLines = buildTokenizerSampleLines(formattedText, viewerResult.value.lineStarts);
  const optimizedTokenizerResult = measureRepeated('optimizedTokenizer', 10, () =>
    tokenizeOptimizedSampleLines(tokenizerSampleLines)
  );
  const legacyTokenizerResult = measureRepeated('legacyTokenizer', 10, () =>
    tokenizeLegacySampleLines(tokenizerSampleLines)
  );
  if (
    optimizedTokenizerResult.value.count !== legacyTokenizerResult.value.count ||
    optimizedTokenizerResult.value.checksum !== legacyTokenizerResult.value.checksum
  ) {
    throw new Error(`Tokenizer benchmark implementations diverged for ${absolutePath}`);
  }
  const rawTreeResult = measure('rawTree', () => parseTree(rawText));
  const formattedTreeResult = measure('formattedTree', () => parseTree(formattedText));
  const rightSearchQuery = getRightSearchQuery(formattedText);
  const rightSearchBatchResult = measure('rightSearchBatch', () =>
    findLiteralSearchBatch(formattedText, rightSearchQuery)
  );
  const optimizedSearchHotPathResult = measureRepeated('optimizedSearchHotPath', 20, () =>
    findOptimizedLineAwareLiteralBatch(formattedText, rightSearchQuery, viewerResult.value.lineStarts)
  );
  const legacySearchHotPathResult = measureRepeated('legacySearchHotPath', 20, () =>
    findLegacyLineAwareLiteralBatch(formattedText, rightSearchQuery, viewerResult.value.lineStarts)
  );
  if (
    optimizedSearchHotPathResult.value.count !== legacySearchHotPathResult.value.count ||
    optimizedSearchHotPathResult.value.lineChecksum !== legacySearchHotPathResult.value.lineChecksum
  ) {
    throw new Error(`Search benchmark implementations diverged for ${absolutePath}`);
  }
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
  const searchTransferMatchCount = Math.max(rightSearchBatchResult.value.count, leftSearchBatchResult.value.count);
  const leftSearchLoadMoreResult = measure('leftSearchLoadMore', () =>
    leftSearchBatchResult.value.hasMore
      ? findLiteralSearchBatch(rawText, leftSearchQuery, leftSearchBatchResult.value.nextStartOffset)
      : { count: 0, hasMore: false, nextStartOffset: leftSearchBatchResult.value.nextStartOffset }
  );
  const leftReplaceAllResult = measure('leftReplaceAll', () =>
    replaceLiteralMatches(rawText, leftSearchQuery, `${leftSearchQuery}-replaced`)
  );
  const legacyLeftReplaceAllResult = measure('legacyLeftReplaceAll', () =>
    replaceLegacyExactMatches(rawText, leftSearchQuery, `${leftSearchQuery}-replaced`)
  );
  if (leftReplaceAllResult.value !== legacyLeftReplaceAllResult.value) {
    throw new Error(`Replace benchmark implementations diverged for ${absolutePath}`);
  }
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
    regionObjectsAvoidedPerFullScroll: uniqueRegionStartLineCount,
    foldStateBinaryLookupsAvoided: viewerResult.value.lineCount - uniqueRegionStartLineCount,
    foldStateLookupAvoidedPercent:
      viewerResult.value.lineCount > 0
        ? ((viewerResult.value.lineCount - uniqueRegionStartLineCount) / viewerResult.value.lineCount) * 100
        : 0,
    viewerRegionIndexBytes: viewerResult.value.regionIndexBytes,
    viewerLegacyCompactionMapBytes: viewerResult.value.legacyCompactionMapBytes,
    viewerPrunedRegionCount: viewerResult.value.prunedRegionCount,
    viewerTransferBufferCount: 2,
    viewerLegacyTransferBufferCount: 5,
    viewerWorkerRetainedBytes: viewerResult.value.lineStarts.byteLength,
    viewerWorkerBytesAvoided: viewerResult.value.regionIndexBytes,
    foldAllIntervalsMs: foldAllResult.ms,
    foldAllIntervalCount: foldAllResult.value.intervalCount,
    foldAllVisitedRegionCount: foldAllResult.value.visitedRegionCount,
    wrapLayoutMs: wrapLayoutResult.ms,
    wrapLayoutBytes: wrapLayoutResult.value.indexBytes,
    wrapLongRowCount: wrapLayoutResult.value.longRowCount,
    wrapRowLookupsAvoidedPerViewport: Math.min(40, viewerResult.value.lineCount),
    optimizedWrapFoldUpdateMs: optimizedWrapFoldUpdateResult.ms,
    legacyWrapFoldUpdateMs: legacyWrapFoldUpdateResult.ms,
    optimizedTokenizerMs: optimizedTokenizerResult.ms,
    legacyTokenizerMs: legacyTokenizerResult.ms,
    tokenizerSampleLineCount: tokenizerSampleLines.length,
    highlightTokenObjectsAvoided: optimizedTokenizerResult.value.count,
    formattedSearchlessScrollRowsMemoized: Math.min(40, Math.max(0, viewerResult.value.lineCount - 1)),
    formattedFullRowsMemoizedPerScroll: Math.min(40, Math.max(0, viewerResult.value.lineCount - 1)),
    formattedRowKeyStringsAvoidedPerViewport: Math.min(40, viewerResult.value.lineCount),
    formattedLineSlicesAvoidedPerScroll: Math.min(40, Math.max(0, viewerResult.value.lineCount - 1)),
    formattedRowStyleComputationsAvoidedPerScroll: Math.min(40, Math.max(0, viewerResult.value.lineCount - 1)),
    formattedRowStateComputationsAvoidedPerScroll: Math.min(40, Math.max(0, viewerResult.value.lineCount - 1)) * 3,
    rawTreeMs: rawTreeResult.ms,
    formattedTreeMs: formattedTreeResult.ms,
    structureTreeWarmupAvoidedMs: rawTreeResult.ms + formattedTreeResult.ms,
    rightSearchBatchMs: rightSearchBatchResult.ms,
    rightSearchBatchCount: rightSearchBatchResult.value.count,
    optimizedSearchHotPathMs: optimizedSearchHotPathResult.ms,
    legacySearchHotPathMs: legacySearchHotPathResult.ms,
    rightSearchLoadMoreMs: rightSearchLoadMoreResult.ms,
    rightSearchLoadMoreCount: rightSearchLoadMoreResult.value.count,
    leftSearchBatchMs: leftSearchBatchResult.ms,
    leftSearchBatchCount: leftSearchBatchResult.value.count,
    leftSearchSourceTransferBytes: rawBytes,
    searchResultPackedBytes: searchTransferMatchCount * 6 * Uint32Array.BYTES_PER_ELEMENT,
    searchResultLegacyNumericBytes: searchTransferMatchCount * 6 * Float64Array.BYTES_PER_ELEMENT,
    searchResultObjectAllocationsAvoided: searchTransferMatchCount,
    highlightMatchCopiesAvoided: searchTransferMatchCount,
    leftSearchLoadMoreMs: leftSearchLoadMoreResult.ms,
    leftSearchLoadMoreCount: leftSearchLoadMoreResult.value.count,
    leftReplaceAllMs: leftReplaceAllResult.ms,
    legacyLeftReplaceAllMs: legacyLeftReplaceAllResult.ms,
    replaceTransferBytes: rawBytes + Buffer.byteLength(leftReplaceAllResult.value, 'utf8'),
    leftRegexReplaceAllMs: leftRegexReplaceAllResult.ms,
    nodeValueReadMs: nodeValueReadResult.ms,
    streamingNodeReadMs: streamingNodeReadResult.ms,
    nodeEditPatchMs: nodeEditPatchResult.ms,
    nodeEditViewerIndexMs: nodeEditViewerResult.ms,
    nodeEditViewerWorkingBytes: nodeEditViewerResult.value.buildWorkingBytes,
    nodeSaveTransferBytes: rawBytes + formattedBytes,
    nodeWarmupMetricRescanAvoidedMs: uiMetricRescanResult.value.rawMs + uiMetricRescanResult.value.formattedMs,
    identityComparisonAvoidedMs: identityComparisonResult.ms,
    uiMetricRescanAvoidedMs: uiMetricRescanResult.ms,
    rawBytes,
    rawViewerIndexMs: rawViewerResult.ms,
    rawViewerIndexBytes: rawViewerResult.value.indexBytes,
    rawViewerLegacyIndexBytes: rawViewerResult.value.legacyIndexBytes,
    rawScrollRowsAvoided: rawViewerResult.value.memoizedScrollRowsAvoided,
    rawScrollSliceCharsAvoided: rawViewerResult.value.memoizedScrollSliceCharsAvoided,
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
