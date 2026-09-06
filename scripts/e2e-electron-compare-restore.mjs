import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveManualJsonSample } from './manual-json-samples.mjs';
import { createSampleJson, importSampleByE2eBridge } from './e2e-json-fixtures.mjs';
import {
  startElectronApp,
  getAvailablePort,
  connectAndPrepareElectronPage,
  collectFailureArtifacts,
} from './e2e-electron-app.mjs';
import { evaluate, waitFor, clickSelector, clickButtonByText } from './e2e-cdp-helpers.mjs';
import { captureElectronScreenshot } from './e2e-screenshot.mjs';

const require = createRequire(import.meta.url);
const port = await getAvailablePort();
const app = await startElectronApp({
  appMain: path.resolve('dist-electron/main.js'),
  cwd: process.cwd(),
  electronCli: require.resolve('electron/cli.js'),
  port,
});
let cdp;
const ready = () =>
  waitFor(
    () =>
      evaluate(
        cdp,
        `!document.querySelector('.editor-processing-layer') && !document.querySelector('.large-json-viewer-loading')`
      ),
    'document ready'
  );
const change = async (selector, value) =>
  evaluate(
    cdp,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const prototype = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'INPUT' ? 'input' : 'change', { bubbles: true })); })()`
  );
const fingerprint = (side = 'Raw') => evaluate(cdp, `window.__HANJSON_E2E_APP__.getActive${side}Fingerprint()`);
async function reopenShortcut() {
  const modifiers = (process.platform === 'darwin' ? 4 : 2) | 8;
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'T',
    code: 'KeyT',
    windowsVirtualKeyCode: 84,
    modifiers,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'T',
    code: 'KeyT',
    windowsVirtualKeyCode: 84,
    modifiers,
  });
}
try {
  cdp = await connectAndPrepareElectronPage(port);
  for (const side of ['A', 'B']) {
    const data = { items: Array(5001).fill(side), ...(side === 'B' ? { zorders: { added: true } } : {}) };
    const file = await saveManualJsonSample(`compare-filter-${side}.json`, JSON.stringify(data));
    if (side === 'B') await clickSelector(cdp, '.add-tab');
    await importSampleByE2eBridge(cdp, file);
    await ready();
  }
  await clickButtonByText(cdp, '对比 JSON');
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.json-compare-selectors select'))`),
    'comparison dialog loaded'
  );
  await change(
    '.json-compare-selectors label:first-child select',
    await evaluate(cdp, `document.querySelector('.json-compare-selectors label:first-child select option').value`)
  );
  await change(
    '.json-compare-selectors label:nth-child(2) select',
    await evaluate(
      cdp,
      `document.querySelector('.json-compare-selectors label:nth-child(2) select option:last-child').value`
    )
  );
  await clickButtonByText(cdp, '开始对比');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.json-compare-summary')?.textContent.includes('修改 2000')`),
    'first batch'
  );
  await change('.json-compare-filters input', 'zorders');
  assert.match(await evaluate(cdp, `document.querySelector('.json-compare-empty').textContent`), /后续仍可能/);
  for (const total of [4000, 5002]) {
    await clickButtonByText(cdp, '继续加载');
    await waitFor(
      () => evaluate(cdp, `document.querySelector('.json-compare-filter-status')?.textContent.includes('${total}')`),
      'filtered continuation'
    );
  }
  assert.equal(await evaluate(cdp, `document.querySelectorAll('.json-compare-row').length`), 1);
  assert.match(await evaluate(cdp, `document.querySelector('.json-compare-filter-status').textContent`), /匹配 1 处/);
  await change('.json-compare-filters select', 'removed');
  assert.match(await evaluate(cdp, `document.querySelector('.json-compare-empty').textContent`), /全部差异中没有/);
  await change('.json-compare-filters select', 'added');
  await clickSelector(cdp, '.json-compare-row button');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.json-compare-details')?.textContent.includes('true')`),
    'filtered detail'
  );
  await clickButtonByText(cdp, '清除筛选');
  assert.equal(await evaluate(cdp, `Boolean(document.querySelector('.json-compare-details'))`), false);
  await change('.json-compare-filters input', 'zorders');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 520,
    height: 650,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(cdp, `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  assert.equal(
    await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.json-compare-filters input, .json-compare-filters select, .json-compare-card .modal-actions button')).every(el => { const r=el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })`
    ),
    true
  );
  const screenshot = path.join(os.tmpdir(), `fxxkjson-compare-filter-${process.pid}.png`);
  await writeFile(screenshot, Buffer.from((await captureElectronScreenshot(cdp)).data, 'base64'));
  console.log(
    JSON.stringify({ filter: '5002 differences, late match, type/path, details and narrow layout passed', screenshot })
  );
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await clickSelector(cdp, '.json-compare-card .about-dialog-close');

  const duplicate = await saveManualJsonSample('compare-duplicate-key.json', '{"status":1,"status":2}');
  await importSampleByE2eBridge(cdp, duplicate);
  await ready();
  await clickButtonByText(cdp, '对比 JSON');
  await clickButtonByText(cdp, '开始对比');
  await waitFor(
    () =>
      evaluate(cdp, `document.querySelector('.json-compare-card [role="alert"]')?.textContent.includes('重复 key')`),
    'duplicate guarded'
  );
  assert.equal(await evaluate(cdp, `Boolean(document.querySelector('.json-compare-empty'))`), false);
  await clickSelector(cdp, '.json-compare-card .about-dialog-close');

  for (const size of [2, 20]) {
    const file = await saveManualJsonSample(`restore-tab-${size}mb.json`, createSampleJson(size * 1024 * 1024));
    await importSampleByE2eBridge(cdp, file);
    await ready();
    const raw = await fingerprint();
    const formatted = await fingerprint('Formatted');
    const title = await evaluate(cdp, `document.querySelector('.tab.active .tab-title').textContent`);
    await clickSelector(cdp, '.tab.active .tab-close');
    const beforeCount = await evaluate(cdp, `document.querySelectorAll('[role="tab"]').length`);
    const started = performance.now();
    if (size === 2) {
      await clickSelector(cdp, '.toolbar-more-trigger');
      await clickButtonByText(cdp, '恢复关闭的标签');
    } else await reopenShortcut();
    await waitFor(
      () =>
        evaluate(
          cdp,
          `document.querySelectorAll('[role="tab"]').length === ${beforeCount + 1} && document.querySelector('.tab.active .tab-title')?.textContent === ${JSON.stringify(title)} && window.__HANJSON_E2E_APP__.getActiveRawFingerprint().length === ${raw.length}`
        ),
      'restored raw'
    );
    await ready();
    await waitFor(async () => (await fingerprint('Formatted')).length === formatted.length, 'restored formatted');
    assert.deepEqual(await fingerprint(), raw);
    assert.deepEqual(await fingerprint('Formatted'), formatted);
    console.log(
      JSON.stringify({ restoreSizeMb: size, restoreReadyMs: Math.round(performance.now() - started), exact: true })
    );
  }
  const draft = await saveManualJsonSample('restore-invalid-draft.json', '{"message":"中文😀","unfinished":');
  await importSampleByE2eBridge(cdp, draft);
  await ready();
  const rawDraft = await fingerprint();
  await clickSelector(cdp, '.tab.active .tab-close');
  await reopenShortcut();
  await waitFor(async () => (await fingerprint()).hash === rawDraft.hash, 'invalid draft restored');
  assert.deepEqual(await fingerprint(), rawDraft);
  console.log('Duplicate guard and exact invalid draft recovery passed');
} catch (error) {
  if (cdp) await collectFailureArtifacts({ cdp, stderr: app.getStderr() }).catch(() => {});
  throw error;
} finally {
  cdp?.close();
  app.child.kill('SIGTERM');
}
