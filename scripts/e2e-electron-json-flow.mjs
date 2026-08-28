import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clickButtonByText, evaluate, waitFor } from './e2e-cdp-helpers.mjs';
import {
  assertElectronMemoryBudget,
  collectFailureArtifacts,
  connectAndPrepareElectronPage,
  getAvailablePort,
  readElectronMemorySnapshot,
  startElectronApp,
} from './e2e-electron-app.mjs';
import { importSampleThroughNativeFileFlow, prepareSampleJsonFile } from './e2e-json-fixtures.mjs';
import { runRepeatedEditFoldingScenario } from './e2e-json-edit-folding-scenario.mjs';
import { runEditTransformScenario } from './e2e-json-edit-transform-scenario.mjs';
import { runMultiTabMemoryScenario } from './e2e-json-multi-tab-memory-scenario.mjs';
import {
  runClipboardAndCompareScenario,
  runRightNodeScenario,
  runSearchReplaceScenario,
} from './e2e-json-flow-scenarios.mjs';

const require = createRequire(import.meta.url);

function printSuccessSummary(sizeMb, samplePath, memorySnapshot, multiTabMemory) {
  console.log('FxxkJson Electron E2E passed');
  console.table([
    { step: 'sample', detail: `${sizeMb}MB generated at ${samplePath}` },
    { step: 'import', detail: 'native MessagePort stream imported JSON through the desktop file flow' },
    {
      step: 'memory',
      detail: `${memorySnapshot.totalWorkingSetMb.toFixed(1)} MB working set, ${memorySnapshot.totalPeakWorkingSetMb.toFixed(1)} MB peak, ${memorySnapshot.rendererHeapMb.toFixed(1)} MB renderer heap`,
    },
    {
      step: 'multi-tab cleanup',
      detail: `${multiTabMemory.expanded.totalWorkingSetMb.toFixed(1)} MB with auxiliary tabs, ${multiTabMemory.afterClose.totalWorkingSetMb.toFixed(1)} MB after close`,
    },
    { step: 'edit folding', detail: 'edit modal keeps JSON folding controls across repeated opens' },
    { step: 'large folding', detail: 'fold-all stays compact while root and nested nodes preserve expand semantics' },
    { step: 'search', detail: 'right pane traceId search returned results' },
    { step: 'locate', detail: 'right node click highlighted left raw JSON' },
    { step: 'delete cancel', detail: 'right node delete preview closes with Escape' },
    { step: 'rename warnings', detail: 'right node rename dialog shows whitespace and duplicate-key warnings' },
    { step: 'edit', detail: 'large right node edit saved back to original JSON' },
    { step: 'edit transforms', detail: 'edit modal converts selected and full JSON into string values' },
    { step: 'save state', detail: 'edited content and locate status remained available after save' },
    { step: 'selection copy', detail: 'right selected value remains selected and copies with Alt+C' },
    { step: 'context paste', detail: 'left editor context menu paste inserts desktop clipboard text' },
    { step: 'compare invalid', detail: 'JSON compare reports parse errors for invalid input' },
  ]);
}

async function assertLargeViewerAutoWrap(cdp) {
  const hasLargeViewer = await evaluate(
    cdp,
    `Boolean(document.querySelector('.right-editor-pane .large-json-viewer'))`
  );
  if (!hasLargeViewer) {
    return;
  }

  await evaluate(
    cdp,
    `(() => {
      const label = Array.from(document.querySelectorAll('.toolbar-checkbox'))
        .find((element) => element.textContent?.includes('自动换行'));
      const input = label?.querySelector('input[type="checkbox"]');
      if (!(input instanceof HTMLInputElement)) return false;
      if (!input.checked) input.click();
      return true;
    })()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
          const rows = Array.from(document.querySelectorAll('.right-editor-pane .large-json-row.wrap'));
          const shortRows = rows.filter((row) => {
            const length = row.querySelector('.large-json-line-text')?.textContent?.length ?? 0;
            return length > 0 && length < 60;
          });
          const longRow = rows.find((row) => row.querySelector('.large-json-line-text')?.textContent?.includes('"message"'));
          const rowRects = rows
            .map((row) => row.getBoundingClientRect())
            .sort((left, right) => left.top - right.top);
          const rowsDoNotOverlap = rowRects.every((rect, index) => {
            const next = rowRects[index + 1];
            return !next || rect.bottom <= next.top + 0.5;
          });
          return shortRows.length >= 3
            && shortRows.every((row) => Math.round(row.getBoundingClientRect().height) === 18)
            && Boolean(longRow && longRow.getBoundingClientRect().height > 18)
            && rowsDoNotOverlap;
        })()`
      ),
    'large viewer wraps only long rows',
    90000
  );
  await evaluate(
    cdp,
    `(() => {
      const label = Array.from(document.querySelectorAll('.toolbar-checkbox'))
        .find((element) => element.textContent?.includes('自动换行'));
      const input = label?.querySelector('input[type="checkbox"]');
      if (input instanceof HTMLInputElement && input.checked) input.click();
      return true;
    })()`
  );
}

async function assertLargeViewerFoldAllSemantics(cdp) {
  const hasLargeViewer = await evaluate(
    cdp,
    `Boolean(document.querySelector('.right-editor-pane .large-json-viewer'))`
  );
  if (!hasLargeViewer) {
    return;
  }

  await clickButtonByText(cdp, '折叠全部');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector(
          '.right-editor-pane .large-json-line-text[data-line-number="1"][data-collapsed="true"]'
        ))`
      ),
    'large viewer fold all',
    90000
  );

  await evaluate(
    cdp,
    `document.querySelector(
      '.right-editor-pane .large-json-line-text[data-line-number="1"]'
    )?.parentElement?.querySelector('.large-json-fold-button')?.click()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector(
          '.right-editor-pane .large-json-line-text[data-line-number="2"][data-collapsed="true"]'
        ))`
      ),
    'large viewer expands root while nested folds remain collapsed',
    90000
  );

  await clickButtonByText(cdp, '展开全部');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector(
          '.right-editor-pane .large-json-line-text[data-line-number="2"]:not([data-collapsed="true"])'
        ))`
      ),
    'large viewer unfold all',
    90000
  );
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
      extraEnvironment: {
        HANJSON_E2E_NATIVE_IMPORT: '1',
        HANJSON_E2E_NATIVE_IMPORT_PATH: samplePath,
      },
      port,
    });
    child = electronApp.child;
    getStderr = electronApp.getStderr;

    cdp = await connectAndPrepareElectronPage(port);
    await runEditTransformScenario(cdp);
    await importSampleThroughNativeFileFlow(cdp);
    await waitFor(
      () => evaluate(cdp, `document.body.innerText.includes('req-e2e-000000')`),
      'imported and formatted JSON',
      90000
    );
    await assertLargeViewerAutoWrap(cdp);
    await assertLargeViewerFoldAllSemantics(cdp);
    const memorySnapshot = await readElectronMemorySnapshot(cdp);
    assertElectronMemoryBudget(memorySnapshot, sizeMb);
    const multiTabMemory = await runMultiTabMemoryScenario(cdp, tempDir, sizeMb);

    await runRepeatedEditFoldingScenario(cdp);
    await runSearchReplaceScenario(cdp);
    await runRightNodeScenario(cdp);
    await runClipboardAndCompareScenario(cdp);
    printSuccessSummary(sizeMb, samplePath, memorySnapshot, multiTabMemory);
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
