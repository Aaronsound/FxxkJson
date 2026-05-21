import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const FIXED_SAMPLE_SIZES_MB = [5, 20];
const BASELINE_PATH = 'scripts/perf-baseline.json';

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptPath} failed${signal ? ` with signal ${signal}` : ` with code ${code}`}`));
    });
  });
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-perf-ci-'));
  const forwardedArgs = process.argv.slice(2);

  try {
    await runNodeScript('./scripts/generate-json-samples.mjs', [
      '--out',
      tempDir,
      ...FIXED_SAMPLE_SIZES_MB.map(String),
    ]);

    const sampleFiles = FIXED_SAMPLE_SIZES_MB.map((sizeMb) => path.join(tempDir, `sample-${sizeMb}mb.json`));

    await runNodeScript('./scripts/perf-regression.mjs', [
      '--baseline',
      BASELINE_PATH,
      ...forwardedArgs,
      ...sampleFiles,
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
