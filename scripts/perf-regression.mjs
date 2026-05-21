import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { benchFile, formatBytes, formatDuration } from './bench-json.mjs';

const DEFAULT_SAMPLE_FILES = ['json/sample-5mb.json', 'json/sample-20mb.json'];
const DEFAULT_BASELINE_PATH = 'scripts/perf-baseline.json';
const DEFAULT_TOLERANCE = 0.35;
const COMPARED_METRICS = [
  'totalFormatMs',
  'viewerIndexMs',
  'rawTreeMs',
  'formattedTreeMs',
  'rightSearchBatchMs',
  'rightSearchLoadMoreMs',
  'nodeValueReadMs',
  'nodeEditPatchMs',
];

function parseArgs(args) {
  const files = [];
  let baselinePath = null;
  let writeBaselinePath = null;
  let tolerance = DEFAULT_TOLERANCE;
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

function toBaseline(results) {
  return {
    createdAt: new Date().toISOString(),
    metrics: Object.fromEntries(
      results.map((result) => [
        result.fileName,
        Object.fromEntries(COMPARED_METRICS.map((metric) => [metric, result[metric]])),
      ])
    ),
  };
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

function printResults(results, failures, baselinePath) {
  console.table(
    results.map((result) => ({
      file: result.fileName,
      rawSize: formatBytes(result.rawBytes),
      formattedSize: formatBytes(result.formattedBytes),
      formatTotal: formatDuration(result.totalFormatMs),
      viewerIndex: formatDuration(result.viewerIndexMs),
      rawTree: formatDuration(result.rawTreeMs),
      formattedTree: formatDuration(result.formattedTreeMs),
      rightSearch: formatDuration(result.rightSearchBatchMs),
      rightSearchMore: formatDuration(result.rightSearchLoadMoreMs),
      nodeRead: formatDuration(result.nodeValueReadMs),
      nodePatch: formatDuration(result.nodeEditPatchMs),
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
  const { baselinePath, files, outputJson, tolerance, writeBaselinePath } = parseArgs(process.argv.slice(2));
  const filesToBench = files.length > 0 ? files : await getExistingDefaultSamples();
  const effectiveBaselinePath = await getDefaultBaselinePath(baselinePath, writeBaselinePath);

  if (filesToBench.length === 0) {
    console.log('No default sample files found. Generate them with `npm run samples -- 5 20`.');
    return;
  }

  const results = [];
  for (const filePath of filesToBench) {
    results.push(await benchFile(filePath));
  }

  if (writeBaselinePath) {
    await fs.mkdir(path.dirname(writeBaselinePath), { recursive: true });
    await fs.writeFile(writeBaselinePath, `${JSON.stringify(toBaseline(results), null, 2)}\n`, 'utf8');
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
          tolerance,
          writeBaselinePath,
        },
        null,
        2
      )
    );
  } else {
    printResults(results, failures, effectiveBaselinePath);
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
