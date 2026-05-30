import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { benchFile, getDefaultSampleFiles } from './bench-json-runner.mjs';
import { formatBytes, formatDuration } from './bench-json-metrics.mjs';
import { printResult, printSummary } from './bench-json-report.mjs';

async function collectBenchmarkResults(filesToBench) {
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

  return results;
}

async function getFilesToBench(args) {
  const fileArgs = args.filter((arg) => arg !== '--json' && arg !== '--samples');
  const shouldUseSamples = args.includes('--samples') || fileArgs.length === 0;
  return shouldUseSamples && fileArgs.length === 0 ? getDefaultSampleFiles() : fileArgs;
}

async function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  const filesToBench = await getFilesToBench(args);

  if (filesToBench.length === 0) {
    console.error('Usage: npm run bench -- [file.json ...] [--samples] [--json]');
    console.error('No benchmark files were provided and no default json/sample-*.json files were found.');
    process.exitCode = 1;
    return;
  }

  const results = await collectBenchmarkResults(filesToBench);

  if (outputJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  results.forEach(printResult);
  printSummary(results);
}

export { benchFile, formatBytes, formatDuration };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
