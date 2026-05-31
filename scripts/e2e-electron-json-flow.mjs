import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { evaluate, waitFor } from './e2e-cdp-helpers.mjs';
import {
  collectFailureArtifacts,
  connectAndPrepareElectronPage,
  getAvailablePort,
  startElectronApp,
} from './e2e-electron-app.mjs';
import { importSampleByE2eBridge, prepareSampleJsonFile } from './e2e-json-fixtures.mjs';
import {
  runClipboardAndCompareScenario,
  runRightNodeScenario,
  runSearchReplaceScenario,
} from './e2e-json-flow-scenarios.mjs';

const require = createRequire(import.meta.url);

function printSuccessSummary(sizeMb, samplePath) {
  console.log('FxxkJson Electron E2E passed');
  console.table([
    { step: 'sample', detail: `${sizeMb}MB generated at ${samplePath}` },
    { step: 'import', detail: 'E2E bridge imported JSON through app import flow' },
    { step: 'search', detail: 'right pane traceId search returned results' },
    { step: 'locate', detail: 'right node click highlighted left raw JSON' },
    { step: 'delete cancel', detail: 'right node delete preview closes with Escape' },
    { step: 'rename warnings', detail: 'right node rename dialog shows whitespace and duplicate-key warnings' },
    { step: 'edit', detail: 'large right node edit saved back to original JSON' },
    { step: 'save state', detail: 'edited content and locate status remained available after save' },
    { step: 'selection copy', detail: 'right selected value remains selected and copies with Alt+C' },
    { step: 'context paste', detail: 'left editor context menu paste inserts desktop clipboard text' },
    { step: 'compare invalid', detail: 'JSON compare reports parse errors for invalid input' },
  ]);
}

async function run() {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.HANJSON_E2E_FORCE) {
    console.log('FxxkJson Electron E2E skipped: no DISPLAY is available on Linux');
    return;
  }

  const cwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-e2e-'));
  const port = await getAvailablePort();
  const electronCli = require.resolve('electron/cli.js');
  const appMain = path.join(cwd, 'dist-electron/main.js');
  let child = null;
  let cdp = null;
  let getStderr = () => '';

  try {
    const { samplePath, sizeMb } = await prepareSampleJsonFile(tempDir);
    const electronApp = await startElectronApp({
      appMain,
      cwd,
      electronCli,
      port,
    });
    child = electronApp.child;
    getStderr = electronApp.getStderr;

    cdp = await connectAndPrepareElectronPage(port);
    await importSampleByE2eBridge(cdp, samplePath);
    await waitFor(
      () => evaluate(cdp, `document.body.innerText.includes('req-e2e-000000')`),
      'imported and formatted JSON',
      90000
    );

    await runSearchReplaceScenario(cdp);
    await runRightNodeScenario(cdp);
    await runClipboardAndCompareScenario(cdp);
    printSuccessSummary(sizeMb, samplePath);
  } catch (error) {
    const stderr = getStderr();
    await collectFailureArtifacts({ cdp, stderr });
    if (stderr) {
      console.error(stderr);
    }
    throw error;
  } finally {
    cdp?.close();
    if (child && !child.killed) {
      child.kill();
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
