import { parseTree } from 'jsonc-parser';
import {
  buildViewerDataStats,
  findLiteralSearchBatch,
  formatBytes,
  formatDuration,
  measure,
  readFirstRequestValue,
  replaceLiteralMatches,
} from './bench-json-metrics.mjs';

const RECORD_COUNT = 2600;
const LIMITS_MS = {
  format: 750,
  nodeRead: 200,
  replaceAll: 300,
  searchBatch: 200,
  viewerIndex: 400,
};

function createFixture() {
  return JSON.stringify(
    Array.from({ length: RECORD_COUNT }, (_, index) => ({
      id: index,
      name: `FxxkJson perf fixture ${index}`,
      active: index % 2 === 0,
      nested: {
        requestId: `req-perf-${String(index).padStart(5, '0')}`,
        values: [index, index + 1, index + 2],
      },
    }))
  );
}

function assertUnderLimit(metric, actualMs) {
  const limitMs = LIMITS_MS[metric];
  if (typeof limitMs !== 'number') {
    return;
  }

  if (actualMs > limitMs) {
    throw new Error(`${metric} took ${formatDuration(actualMs)}, limit ${formatDuration(limitMs)}`);
  }
}

function main() {
  const rawText = createFixture();
  const parseResult = measure('parse', () => JSON.parse(rawText));
  const stringifyResult = measure('stringify', () => JSON.stringify(parseResult.value, null, 2));
  const formattedText = stringifyResult.value;
  const formatMs = parseResult.ms + stringifyResult.ms;
  const viewerResult = measure('viewerIndex', () => buildViewerDataStats(formattedText));
  const formattedTreeResult = measure('formattedTree', () => parseTree(formattedText));
  const searchResult = measure('searchBatch', () => findLiteralSearchBatch(formattedText, 'requestId'));
  const nodeReadResult = measure('nodeRead', () => readFirstRequestValue(formattedText, formattedTreeResult.value));
  const replaceAllResult = measure('replaceAll', () => replaceLiteralMatches(rawText, 'requestId', 'traceId'));

  if (searchResult.value.count < 2000 || !searchResult.value.hasMore) {
    throw new Error('perf smoke search did not exercise batched search');
  }

  if (!nodeReadResult.value?.literal.startsWith('"req-perf-')) {
    throw new Error('perf smoke node read did not resolve the expected requestId node');
  }

  assertUnderLimit('format', formatMs);
  assertUnderLimit('viewerIndex', viewerResult.ms);
  assertUnderLimit('searchBatch', searchResult.ms);
  assertUnderLimit('nodeRead', nodeReadResult.ms);
  assertUnderLimit('replaceAll', replaceAllResult.ms);

  console.log('FxxkJson performance smoke passed');
  console.table([
    { metric: 'raw size', value: formatBytes(Buffer.byteLength(rawText, 'utf8')) },
    { metric: 'formatted size', value: formatBytes(Buffer.byteLength(formattedText, 'utf8')) },
    { metric: 'format', value: formatDuration(formatMs) },
    { metric: 'viewer index', value: formatDuration(viewerResult.ms) },
    { metric: 'search batch', value: formatDuration(searchResult.ms) },
    { metric: 'node read', value: formatDuration(nodeReadResult.ms) },
    { metric: 'replace all', value: formatDuration(replaceAllResult.ms) },
  ]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
