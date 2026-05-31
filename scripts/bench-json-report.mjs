import { formatBytes, formatDuration } from './bench-json-metrics.mjs';

export function printResult(result) {
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
    {
      stage: `right-search-more-${result.rightSearchLoadMoreCount}`,
      duration: formatDuration(result.rightSearchLoadMoreMs),
    },
    { stage: `left-search-${result.leftSearchBatchCount}`, duration: formatDuration(result.leftSearchBatchMs) },
    {
      stage: `left-search-more-${result.leftSearchLoadMoreCount}`,
      duration: formatDuration(result.leftSearchLoadMoreMs),
    },
    { stage: 'left-replace-all', duration: formatDuration(result.leftReplaceAllMs) },
    { stage: 'left-regex-replace-all', duration: formatDuration(result.leftRegexReplaceAllMs) },
    { stage: 'node-value-read', duration: formatDuration(result.nodeValueReadMs) },
    { stage: 'node-edit-patch', duration: formatDuration(result.nodeEditPatchMs) },
  ]);
  console.log(`Viewer lines: ${result.viewerLineCount.toLocaleString()}`);
  console.log(`Viewer regions: ${result.viewerRegionCount.toLocaleString()}`);
}

export function printSummary(results) {
  if (results.length <= 1) {
    return;
  }

  console.log('\nSummary');
  console.table(
    results.map((result) => ({
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
      leftSearch: formatDuration(result.leftSearchBatchMs),
      leftSearchMore: formatDuration(result.leftSearchLoadMoreMs),
      leftReplaceAll: formatDuration(result.leftReplaceAllMs),
      leftRegexReplaceAll: formatDuration(result.leftRegexReplaceAllMs),
      nodeRead: formatDuration(result.nodeValueReadMs),
      nodePatch: formatDuration(result.nodeEditPatchMs),
      viewerLines: result.viewerLineCount.toLocaleString(),
      viewerRegions: result.viewerRegionCount.toLocaleString(),
    }))
  );
}
