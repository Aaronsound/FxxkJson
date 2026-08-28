import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { benchFile, formatBytes, formatDuration } from './bench-json.mjs';

const DEFAULT_SAMPLE_FILES = ['json/sample-5mb.json', 'json/sample-20mb.json'];
const DEFAULT_BASELINE_PATH = 'scripts/perf-baseline.json';
const DEFAULT_RUNS = 3;
const DEFAULT_TOLERANCE = 0.25;
const COMPARED_METRICS = [
  'totalFormatMs',
  'viewerIndexMs',
  'foldAllIntervalsMs',
  'wrapLayoutMs',
  'rawViewerIndexMs',
  'caseInsensitiveSearchBatchMs',
  'rawTreeMs',
  'formattedTreeMs',
  'rightSearchBatchMs',
  'rightSearchLoadMoreMs',
  'leftSearchBatchMs',
  'leftSearchLoadMoreMs',
  'leftReplaceAllMs',
  'leftRegexReplaceAllMs',
  'nodeValueReadMs',
  'streamingNodeReadMs',
  'nodeEditPatchMs',
  'nodeEditViewerIndexMs',
];

function parseArgs(args) {
  const files = [];
  let baselinePath = null;
  let writeBaselinePath = null;
  let tolerance = DEFAULT_TOLERANCE;
  let runs = DEFAULT_RUNS;
  let outputJson = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--baseline') {
      baselinePath = path.resolve(args[index + 1] ?? '');
      index += 1;
      continue;
    }

    if (arg === '--write-baseline') {
      writeBaselinePath = path.resolve(args[index + 1] ?? '');
      index += 1;
      continue;
    }

    if (arg === '--tolerance') {
      tolerance = Number(args[index + 1]);
      if (!Number.isFinite(tolerance) || tolerance < 0) {
        throw new Error('--tolerance requires a non-negative number');
      }
      index += 1;
      continue;
    }

    if (arg === '--runs') {
      runs = Number(args[index + 1]);
      if (!Number.isInteger(runs) || runs < 1) {
        throw new Error('--runs requires a positive integer');
      }
      index += 1;
      continue;
    }

    if (arg === '--json') {
      outputJson = true;
      continue;
    }

    if (arg !== '--samples') {
      files.push(arg);
    }
  }

  return {
    baselinePath,
    files,
    outputJson,
    runs,
    tolerance,
    writeBaselinePath,
  };
}

async function getExistingDefaultSamples() {
  const existing = [];

  for (const filePath of DEFAULT_SAMPLE_FILES) {
    try {
      await fs.access(path.resolve(filePath));
      existing.push(filePath);
    } catch {
      // Missing samples are skipped so fresh clones can still run this command.
    }
  }

  return existing;
}

async function getDefaultBaselinePath(explicitBaselinePath, writeBaselinePath) {
  if (explicitBaselinePath || writeBaselinePath) {
    return explicitBaselinePath;
  }

  const resolvedPath = path.resolve(DEFAULT_BASELINE_PATH);

  try {
    await fs.access(resolvedPath);
    return resolvedPath;
  } catch {
    return null;
  }
}

function toBaseline(results, runs) {
  return {
    createdAt: new Date().toISOString(),
    aggregation: `median of ${runs} run${runs === 1 ? '' : 's'}`,
    metrics: Object.fromEntries(
      results.map((result) => [
        result.fileName,
        Object.fromEntries(COMPARED_METRICS.map((metric) => [metric, result[metric]])),
      ])
    ),
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function aggregateResults(results) {
  const representative = { ...results[results.length - 1] };
  const keys = new Set(results.flatMap((result) => Object.keys(result)));
  for (const key of keys) {
    const values = results.map((result) => result[key]);
    if (values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      representative[key] = median(values);
    }
  }
  return representative;
}

async function readBaseline(filePath) {
  if (!filePath) {
    return null;
  }

  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function compareResults(results, baseline, tolerance) {
  if (!baseline?.metrics) {
    return [];
  }

  const failures = [];

  for (const result of results) {
    const expected = baseline.metrics[result.fileName];
    if (!expected) {
      continue;
    }

    for (const metric of COMPARED_METRICS) {
      const baselineValue = expected[metric];
      const actualValue = result[metric];
      if (typeof baselineValue !== 'number' || typeof actualValue !== 'number') {
        continue;
      }

      const allowed = baselineValue * (1 + tolerance);
      if (actualValue > allowed) {
        failures.push({
          fileName: result.fileName,
          metric,
          baseline: baselineValue,
          actual: actualValue,
          allowed,
        });
      }
    }
  }

  return failures;
}

function printResults(results, failures, baselinePath, runs) {
  console.log(`Benchmark aggregation: median of ${runs} run${runs === 1 ? '' : 's'} per sample`);
  console.table(
    results.map((result) => ({
      file: result.fileName,
      rawSize: formatBytes(result.rawBytes),
      formattedSize: formatBytes(result.formattedBytes),
      formatTotal: formatDuration(result.totalFormatMs),
      viewerIndex: formatDuration(result.viewerIndexMs),
      viewerWorkingMemory: formatBytes(result.viewerIndexWorkingBytes),
      viewerMapAvoided: formatBytes(result.viewerLegacyCompactionMapBytes),
      viewerRegionsPruned: result.viewerPrunedRegionCount,
      regionObjectsAvoidedFullScroll: result.regionObjectsAvoidedPerFullScroll.toLocaleString(),
      foldStateLookupsAvoided: `${result.foldStateBinaryLookupsAvoided.toLocaleString()} (${result.foldStateLookupAvoidedPercent.toFixed(1)}%)`,
      viewerTransferBuffers: `${result.viewerTransferBufferCount}/${result.viewerLegacyTransferBufferCount}`,
      workerViewerRetained: formatBytes(result.viewerWorkerRetainedBytes),
      workerViewerAvoided: formatBytes(result.viewerWorkerBytesAvoided),
      foldAllIntervals: formatDuration(result.foldAllIntervalsMs),
      foldAllVisited: `${result.foldAllVisitedRegionCount}/${result.viewerRegionCount}`,
      foldStateInsertComparisons: `${result.optimizedFoldStateInsertComparisons}/${result.legacyFoldStateInsertComparisons}`,
      foldStateRemoveComparisons: `${result.optimizedFoldStateRemoveComparisons}/${result.legacyFoldStateRemoveComparisons}`,
      explicitFoldRegionWorkAvoided: `${result.explicitFoldRegionLookupsAvoided} lookups + ${result.explicitFoldRegionObjectsAvoided} objects`,
      wrapLayout: formatDuration(result.wrapLayoutMs),
      wrapFoldUpdate: `${formatDuration(result.optimizedWrapFoldUpdateMs)} / ${formatDuration(result.legacyWrapFoldUpdateMs)}`,
      wrapIndex: formatBytes(result.wrapLayoutBytes),
      wrapRowLookupsAvoided: `${result.wrapRowLookupsAvoidedPerViewport}/40 rows`,
      visibleSegmentRowLookupsAvoided: `${result.visibleSegmentRowBinaryLookupsAvoidedPerViewport}/40 rows`,
      visibleSegmentRevealLookupAvoided: result.visibleSegmentRevealBinaryLookupsAvoided,
      wrapOffsetComparisons: `${result.optimizedWrapOffsetComparisons}/${result.legacyWrapOffsetComparisons}`,
      lineTokenize: `${formatDuration(result.optimizedTokenizerMs)} / ${formatDuration(result.legacyTokenizerMs)}`,
      highlightTokenObjectsAvoided: result.highlightTokenObjectsAvoided,
      formattedSearchlessScrollRowsMemoized: result.formattedSearchlessScrollRowsMemoized,
      formattedFullRowsMemoized: result.formattedFullRowsMemoizedPerScroll,
      formattedRowKeyStringsAvoided: `${result.formattedRowKeyStringsAvoidedPerViewport}/40 rows`,
      formattedLineSlicesAvoided: `${result.formattedLineSlicesAvoidedPerScroll}/40 rows`,
      formattedRowStylesAvoided: `${result.formattedRowStyleComputationsAvoidedPerScroll}/40 rows`,
      formattedRowStateComputationsAvoided: result.formattedRowStateComputationsAvoidedPerScroll,
      rawViewerIndex: formatDuration(result.rawViewerIndexMs),
      rawViewerMemory: `${formatBytes(result.rawViewerIndexBytes)} / ${formatBytes(result.rawViewerLegacyIndexBytes)}`,
      rawViewerTransferBuffers: `${result.rawViewerTransferBufferCount}/${result.rawViewerLegacyTransferBufferCount}`,
      rawViewerGrowthCopiesAvoided: formatBytes(result.rawViewerGrowthCopyBytesAvoided),
      rawViewerCompactionCopyAvoided: formatBytes(result.rawViewerCompactionCopyBytesAvoided),
      rawScrollRowsAvoided: result.rawScrollRowsAvoided,
      rawScrollSlicesAvoided: `${result.rawScrollSliceCharsAvoided.toLocaleString()} chars`,
      caseInsensitiveSearch: formatDuration(result.caseInsensitiveSearchBatchMs),
      rawTree: formatDuration(result.rawTreeMs),
      formattedTree: formatDuration(result.formattedTreeMs),
      treeWarmupAvoided: formatDuration(result.structureTreeWarmupAvoidedMs),
      rightSearch: formatDuration(result.rightSearchBatchMs),
      searchHotPath: `${formatDuration(result.optimizedSearchHotPathMs)} / ${formatDuration(result.legacySearchHotPathMs)}`,
      rightSearchMore: formatDuration(result.rightSearchLoadMoreMs),
      leftSearch: formatDuration(result.leftSearchBatchMs),
      leftSearchMore: formatDuration(result.leftSearchLoadMoreMs),
      leftSearchTransfer: formatBytes(result.leftSearchSourceTransferBytes),
      searchResultPayload: `${formatBytes(result.searchResultPackedBytes)} / ${formatBytes(result.searchResultLegacyNumericBytes)}`,
      searchObjectsAvoided: result.searchResultObjectAllocationsAvoided,
      highlightMatchCopiesAvoided: result.highlightMatchCopiesAvoided,
      leftReplaceAll: formatDuration(result.leftReplaceAllMs),
      exactReplaceHotPath: `${formatDuration(result.leftReplaceAllMs)} / ${formatDuration(result.legacyLeftReplaceAllMs)}`,
      replaceTransfer: formatBytes(result.replaceTransferBytes),
      leftRegexReplaceAll: formatDuration(result.leftRegexReplaceAllMs),
      nodeRead: formatDuration(result.nodeValueReadMs),
      streamingNodeRead: formatDuration(result.streamingNodeReadMs),
      nodePatch: formatDuration(result.nodeEditPatchMs),
      nodePatchDiffAvoided: formatDuration(result.nodeExactPatchDiffAvoidedMs),
      nodeIncrementalMetrics: formatDuration(result.nodeIncrementalMetricsMs),
      nodeReindex: formatDuration(result.nodeEditViewerIndexMs),
      nodeIncrementalReindex: formatDuration(result.nodeEditIncrementalViewerIndexMs),
      nodeReindexMemory: formatBytes(result.nodeEditViewerWorkingBytes),
      nodeSaveTransfer: formatBytes(result.nodeSaveTransferBytes),
      nodeSavePatchTransfer: formatBytes(result.nodeSavePatchTransferBytes),
      nodeSaveRequestTransfer: `${formatBytes(result.nodeSaveCachedRequestTransferBytes)} / ${formatBytes(result.nodeSaveRequestTransferBytes)}`,
      nodeWarmupRescanAvoided: formatDuration(result.nodeWarmupMetricRescanAvoidedMs),
      identityComparisonAvoided: formatDuration(result.identityComparisonAvoidedMs),
      uiMetricRescanAvoided: formatDuration(result.uiMetricRescanAvoidedMs),
    }))
  );

  if (!baselinePath) {
    console.log('\nNo baseline provided. To create one:');
    console.log(`  npm run perf:regression -- --write-baseline ${DEFAULT_BASELINE_PATH}`);
    return;
  }

  if (failures.length === 0) {
    console.log(`\nPerformance regression check passed against ${baselinePath}`);
    return;
  }

  console.log(`\nPerformance regressions against ${baselinePath}`);
  console.table(
    failures.map((failure) => ({
      file: failure.fileName,
      metric: failure.metric,
      actual: formatDuration(failure.actual),
      baseline: formatDuration(failure.baseline),
      allowed: formatDuration(failure.allowed),
    }))
  );
}

async function main() {
  const { baselinePath, files, outputJson, runs, tolerance, writeBaselinePath } = parseArgs(process.argv.slice(2));
  const filesToBench = files.length > 0 ? files : await getExistingDefaultSamples();
  const effectiveBaselinePath = await getDefaultBaselinePath(baselinePath, writeBaselinePath);

  if (filesToBench.length === 0) {
    console.log('No default sample files found. Generate them with `npm run samples -- 5 20`.');
    return;
  }

  const results = [];
  for (const filePath of filesToBench) {
    const samples = [];
    for (let run = 0; run < runs; run += 1) {
      samples.push(await benchFile(filePath));
    }
    results.push(aggregateResults(samples));
  }

  if (writeBaselinePath) {
    await fs.mkdir(path.dirname(writeBaselinePath), { recursive: true });
    await fs.writeFile(writeBaselinePath, `${JSON.stringify(toBaseline(results, runs), null, 2)}\n`, 'utf8');
  }

  const baseline = await readBaseline(effectiveBaselinePath);
  const failures = compareResults(results, baseline, tolerance);

  if (outputJson) {
    console.log(
      JSON.stringify(
        {
          baselinePath: effectiveBaselinePath,
          failures,
          results,
          runs,
          tolerance,
          writeBaselinePath,
        },
        null,
        2
      )
    );
  } else {
    printResults(results, failures, effectiveBaselinePath, runs);
    if (writeBaselinePath) {
      console.log(`\nBaseline written to ${writeBaselinePath}`);
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
