import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveManualJsonSample } from './manual-json-samples.mjs';
import { layoutJsonTokens } from './load-lossless-formatter.mjs';
import { captureElectronScreenshot } from './e2e-screenshot.mjs';
import { createSampleJson } from './e2e-json-fixtures.mjs';
import {
  startElectronApp,
  getAvailablePort,
  connectAndPrepareElectronPage,
  collectFailureArtifacts,
} from './e2e-electron-app.mjs';
import { evaluate, waitFor, clickSelector } from './e2e-cdp-helpers.mjs';

const small =
  '{"id":9007199254740993,"decimal":0.1234567890123456789,"huge":1e400,"zero":-0,"status":1,"status":2,"name":"before","中文":"😀"}';
const fixture = await saveManualJsonSample('precision-duplicate-key.json', small);
const directory = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-save-e2e-'));
const savedFile = path.join(directory, 'saved 中文.json');
const require = createRequire(import.meta.url);
const port = await getAvailablePort();
const app = await startElectronApp({
  appMain: path.resolve('dist-electron/main.js'),
  cwd: process.cwd(),
  electronCli: require.resolve('electron/cli.js'),
  port,
  extraEnvironment: { HANJSON_E2E_NATIVE_SAVE: '1', HANJSON_E2E_NATIVE_SAVE_PATH: savedFile },
});
let cdp;
let screenshotTaken = false;
const clickText = (text) =>
  evaluate(
    cdp,
    `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)} && b.getBoundingClientRect().width).click()`
  );
async function saveAs(mode) {
  await clickSelector(cdp, '.toolbar-more-trigger');
  await clickText('另存为…');
  await waitFor(() => evaluate(cdp, `Boolean(document.querySelector('#json-save-title'))`), 'save dialog');
  if (process.argv.includes('--screenshots') && !screenshotTaken) {
    const output = path.join(os.tmpdir(), `fxxkjson-save-dialog-${process.pid}.png`);
    const screenshot = await captureElectronScreenshot(cdp);
    await writeFile(output, Buffer.from(screenshot.data, 'base64'));
    console.log(JSON.stringify({ screenshot: output }));
    screenshotTaken = true;
  }
  await evaluate(
    cdp,
    `(() => {const select = document.querySelector('.json-save-card select'); select.value = ${JSON.stringify(mode)}; select.dispatchEvent(new Event('change',{bubbles:true}));})()`
  );
  await clickText('选择保存位置');
  await waitFor(() => evaluate(cdp, `!document.querySelector('#json-save-title')`), 'native save complete', 30000);
  return readFile(savedFile, 'utf8');
}
try {
  cdp = await connectAndPrepareElectronPage(port);
  await evaluate(
    cdp,
    `window.__HANJSON_E2E_APP__.importText('precision.json', ${Buffer.byteLength(small)}, ${JSON.stringify(small)})`
  );
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.toolbar-feedback')?.textContent.includes('重复 key')`),
    'duplicate warning'
  );
  await clickText('定位重复 key');
  assert.equal(await saveAs('raw'), small);
  assert.equal(await saveAs('formatted'), layoutJsonTokens(small));
  assert.equal(await saveAs('compact'), small);
  await clickText('编辑 JSON');
  await waitFor(() => evaluate(cdp, 'Boolean(window.__HANJSON_E2E_EDIT_MODAL__?.__editor)'), 'edit ready');
  const draft = await evaluate(cdp, 'window.__HANJSON_E2E_EDIT_MODAL__.__editor.getValue()');
  assert.equal(layoutJsonTokens(draft, ''), small);
  await evaluate(
    cdp,
    `window.__HANJSON_E2E_EDIT_MODAL__.__editor.setValue(${JSON.stringify(layoutJsonTokens(small.replace('before', 'after')))})`
  );
  await clickText('更新为原始 JSON');
  await waitFor(() => evaluate(cdp, `!document.querySelector('#json-edit-title')`), 'edit saved');
  assert.equal(await saveAs('raw'), small.replace('before', 'after'));
  for (const size of [2, 20, 40]) {
    const sourceSize = size === 40 ? 20 : size;
    const sourceFile = await saveManualJsonSample(
      `lossless-save-${sourceSize}mb.json`,
      createSampleJson(sourceSize * 1024 * 1024).replace(
        '"id":0',
        '"id":9007199254740993,"exactDecimal":0.1234567890123456789,"repeated":1,"repeated":2'
      )
    );
    const raw = await readFile(sourceFile, 'utf8');
    const text = size === 40 ? `[${raw},${raw}]` : raw;
    if (size === 40) await saveManualJsonSample('lossless-save-40mb.json', text);
    const expectedFormattedLength = layoutJsonTokens(text).length;
    await evaluate(
      cdp,
      `window.__HANJSON_E2E_APP__.importText('save-${size}mb.json', ${Buffer.byteLength(text)}, ${JSON.stringify(text)})`
    );
    await waitFor(
      () =>
        evaluate(
          cdp,
          `!document.querySelector('.editor-processing-layer') && window.__HANJSON_E2E_APP__.getActiveFormattedFingerprint().length === ${expectedFormattedLength}`
        ),
      'large import ready',
      30000
    );
    const start = performance.now();
    assert.equal(await saveAs('compact'), layoutJsonTokens(text, ''));
    assert.equal(await saveAs('formatted'), layoutJsonTokens(text));
    assert.equal(await saveAs('raw'), text);
    console.log(JSON.stringify({ sizeMb: size, saveRoundTripMs: performance.now() - start, exact: true }));
  }
  await clickSelector(cdp, '.toolbar-more-trigger');
  await clickSelector(cdp, '.toolbar-language-menu:not(.toolbar-theme-menu) summary');
  await clickText('English');
  await clickSelector(cdp, '.toolbar-more-trigger');
  await clickText('Save as…');
  await waitFor(() => evaluate(cdp, `Boolean(document.querySelector('#json-save-title'))`), 'English save dialog');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 520,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const bounds = await evaluate(
    cdp,
    `(() => {
    const card=document.querySelector('.json-save-card'); const r=card.getBoundingClientRect();
    const buttons=Array.from(card.querySelectorAll('button,select')).map(e=>e.getBoundingClientRect());
    return {text:card.textContent, fits:r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && buttons.every(b=>b.right<=innerWidth && b.bottom<=innerHeight)};
  })()`
  );
  assert.equal(bounds.fits, true);
  assert.ok(bounds.text.includes('Choose location'));
  if (process.argv.includes('--screenshots')) {
    const output = path.join(os.tmpdir(), `fxxkjson-save-dialog-en-${process.pid}.png`);
    const screenshot = await captureElectronScreenshot(cdp);
    await writeFile(output, Buffer.from(screenshot.data, 'base64'));
    console.log(JSON.stringify({ screenshot: output }));
  }
  await clickText('Cancel');
  console.log(
    JSON.stringify({ passed: true, fixture, nativeSave: true, precision: true, duplicates: true, edit: true })
  );
} catch (error) {
  await collectFailureArtifacts({ cdp, stderr: app.getStderr() });
  throw error;
} finally {
  cdp?.close();
  app.child.kill('SIGTERM');
  await rm(directory, { recursive: true, force: true });
}
