import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { clickSelector, evaluate, waitFor } from './e2e-cdp-helpers.mjs';
import { assertElectronMemoryBudget, readElectronMemorySnapshot } from './e2e-electron-app.mjs';
import { createSampleJson, importSampleByE2eBridge } from './e2e-json-fixtures.mjs';

const AUXILIARY_TAB_COUNT = 2;

async function waitForTabCount(cdp, count, label) {
  await waitFor(() => evaluate(cdp, `document.querySelectorAll('.tab-bar .tab').length === ${count}`), label, 90000);
}

async function collectRendererGarbage(cdp) {
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
  } catch {
    // Older Electron CDP builds can omit HeapProfiler; the memory budget still runs.
  }
  await evaluate(cdp, 'new Promise((resolve) => setTimeout(resolve, 750))');
}

export async function runMultiTabMemoryScenario(cdp, tempDir, primarySizeMb) {
  // A 20MB run uses two dedicated-viewer auxiliaries so the worker's bounded
  // cache must evict and transparently restore the original tab. Smaller CI
  // smoke runs keep lightweight auxiliaries to avoid inflating routine time.
  const auxiliaryTabSizeMb = primarySizeMb >= 20 ? 5 : 1;
  const initialTabCount = await evaluate(cdp, `document.querySelectorAll('.tab-bar .tab').length`);
  const initialActiveTabTop = await evaluate(
    cdp,
    `document.querySelector('.tab-bar .tab.active')?.getBoundingClientRect().top ?? null`
  );
  const before = await readElectronMemorySnapshot(cdp);

  for (let index = 0; index < AUXILIARY_TAB_COUNT; index += 1) {
    const fileName = `multi-tab-memory-${index + 1}.json`;
    const samplePath = path.join(tempDir, fileName);
    await writeFile(samplePath, createSampleJson(auxiliaryTabSizeMb * 1024 * 1024), 'utf8');
    await clickSelector(cdp, '.tab-bar .add-tab');
    await waitForTabCount(cdp, initialTabCount + index + 1, `multi-tab add ${index + 1}`);
    if (index === 0 && primarySizeMb >= 20) {
      const blankTabTop = await evaluate(
        cdp,
        `document.querySelector('.tab-bar .tab.active')?.getBoundingClientRect().top ?? null`
      );
      if (
        typeof initialActiveTabTop !== 'number' ||
        typeof blankTabTop !== 'number' ||
        Math.abs(blankTabTop - initialActiveTabTop) > 0.5
      ) {
        throw new Error(
          `Tab bar moved vertically when switching from large-file guidance to a blank tab: ${initialActiveTabTop} -> ${blankTabTop}`
        );
      }
    }
    await importSampleByE2eBridge(cdp, samplePath);
    await waitFor(
      () =>
        evaluate(cdp, `document.querySelector('.tab.active .tab-title')?.textContent === ${JSON.stringify(fileName)}`),
      `multi-tab import ${index + 1}`,
      90000
    );
    await waitFor(
      () => evaluate(cdp, `document.querySelectorAll('.editor-loading-overlay').length === 0`),
      `multi-tab format ${index + 1}`,
      90000
    );
  }

  await collectRendererGarbage(cdp);
  const expanded = await readElectronMemorySnapshot(cdp);
  console.log('Multi-tab expanded memory:', expanded);
  assertElectronMemoryBudget(expanded, primarySizeMb + AUXILIARY_TAB_COUNT * auxiliaryTabSizeMb);

  for (let index = AUXILIARY_TAB_COUNT; index > 0; index -= 1) {
    await clickSelector(cdp, '.tab.active .tab-close');
    await waitForTabCount(cdp, initialTabCount + index - 1, `multi-tab close ${index}`);
  }

  await collectRendererGarbage(cdp);
  const afterClose = await readElectronMemorySnapshot(cdp);
  console.log('Multi-tab after-close memory:', afterClose);
  // Peak working set is process-lifetime data, and V8/Chromium can keep freed
  // pages resident after a forced GC. Keep the live JS heap budget tied to the
  // primary document, but allow the OS working set and historical peak to
  // reflect every file opened during this scenario. The comparisons below
  // still fail if closing tabs grows either live heap or working set.
  assertElectronMemoryBudget(afterClose, primarySizeMb, {
    peakSizeMb: primarySizeMb + AUXILIARY_TAB_COUNT * auxiliaryTabSizeMb,
    workingSetSizeMb: primarySizeMb + AUXILIARY_TAB_COUNT * auxiliaryTabSizeMb,
  });

  const workingSetSlackMb = 96;
  const rendererHeapSlackMb = 32;
  if (afterClose.totalWorkingSetMb > expanded.totalWorkingSetMb + workingSetSlackMb) {
    throw new Error(
      `Multi-tab cleanup working set grew from ${expanded.totalWorkingSetMb.toFixed(1)} MB to ${afterClose.totalWorkingSetMb.toFixed(1)} MB`
    );
  }
  if (afterClose.rendererHeapMb > expanded.rendererHeapMb + rendererHeapSlackMb) {
    throw new Error(
      `Multi-tab cleanup renderer heap grew from ${expanded.rendererHeapMb.toFixed(1)} MB to ${afterClose.rendererHeapMb.toFixed(1)} MB`
    );
  }

  return { afterClose, before, expanded };
}
