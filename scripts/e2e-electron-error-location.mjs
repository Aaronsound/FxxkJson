import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { writeFile } from 'node:fs/promises';
import { saveManualJsonSample } from './manual-json-samples.mjs';
import { captureElectronScreenshot } from './e2e-screenshot.mjs';
import {
  startElectronApp,
  getAvailablePort,
  connectAndPrepareElectronPage,
  collectFailureArtifacts,
} from './e2e-electron-app.mjs';
import { evaluate, waitFor, clickButtonByText, clickSelector } from './e2e-cdp-helpers.mjs';

const require = createRequire(import.meta.url);
const port = await getAvailablePort();
const app = await startElectronApp({
  appMain: path.resolve('dist-electron/main.js'),
  cwd: process.cwd(),
  electronCli: require.resolve('electron/cli.js'),
  port,
});
let cdp;
const samples = [];
try {
  cdp = await connectAndPrepareElectronPage(port);
  // Include the performance footer used by the preceding release E2E. This reduces
  // the editor viewport and catches stale Monaco layout after a narrow resize.
  await evaluate(
    cdp,
    `(() => {
    const input = Array.from(document.querySelectorAll('label.toolbar-checkbox'))
      .find(label => label.textContent.includes('显示性能面板'))?.querySelector('input');
    if (input && !input.checked) input.click();
  })()`
  );
  for (const sizeMb of [0, 2, 20]) {
    const text = sizeMb
      ? `{"payload":"${'x'.repeat(sizeMb * 1024 * 1024)}🌍","name":"中文"\r\n  "broken":true}`
      : `{"items":[\n${Array.from({ length: 300 }, (_, i) => JSON.stringify({ id: i })).join(',\n')}\n]\n  "broken":true}`;
    const name = `missing-comma-${sizeMb || 'small'}mb.json`;
    samples.push({ name, text });
    await evaluate(
      cdp,
      `window.__HANJSON_E2E_APP__.importText(${JSON.stringify(name)}, ${Buffer.byteLength(text)}, ${JSON.stringify(text)})`
    );
    await waitFor(
      () =>
        evaluate(
          cdp,
          `Boolean(document.querySelector('.locate-json-error')) && !document.querySelector('.editor-processing-layer')`
        ),
      'syntax error ready'
    );
    const before = await evaluate(cdp, `window.__HANJSON_E2E_APP__.getActiveRawFingerprint()`);
    const initialMark = await evaluate(
      cdp,
      `Boolean(document.querySelector('.left-editor-pane .currentSearchHighlight, .left-editor-pane [data-large-raw-highlight="true"]'))`
    );
    if (initialMark) throw new Error('Error navigation happened without a click');
    if (!sizeMb) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 480,
        height: 650,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitFor(
        () =>
          evaluate(
            cdp,
            `(() => {
        const button = document.querySelector('.locate-json-error').getBoundingClientRect();
        return button.left >= 0 && button.right <= innerWidth && button.bottom < innerHeight;
      })()`
          ),
        'locate action fits narrow window'
      );
    }
    await clickSelector(cdp, '.locate-json-error');
    await waitFor(
      () =>
        evaluate(
          cdp,
          `(() => {
      const pane = document.querySelector('.left-editor-pane');
      const mark = pane.querySelector('.currentSearchHighlight, [data-large-raw-highlight="true"]');
      if (!mark) return false;
      const r = mark.getBoundingClientRect(), p = pane.getBoundingClientRect();
      return r.width > 0 && r.top >= p.top && r.bottom <= p.bottom && r.right > p.left && r.left < p.right;
    })()`
        ),
      'error highlighted in viewport'
    );
    const after = await evaluate(cdp, `window.__HANJSON_E2E_APP__.getActiveRawFingerprint()`);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Locating modified raw JSON');
    if (!sizeMb) {
      try {
        const screenshot = await captureElectronScreenshot(cdp);
        const screenshotPath = path.join(os.tmpdir(), 'fxxkjson-error-location-narrow.png');
        await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
        console.log(`Narrow UI screenshot: ${screenshotPath}`);
      } catch (error) {
        console.warn(`Optional screenshot unavailable: ${error.message}`);
      }
      await cdp.send('Emulation.clearDeviceMetricsOverride');
    }
    const position = await evaluate(cdp, `document.querySelector('.json-error-position').textContent`);
    if (sizeMb && !position.includes('第 2 行，第 3 列')) throw new Error(`Wrong CRLF position: ${position}`);
    await clickSelector(cdp, '.add-tab');
    if (await evaluate(cdp, `Boolean(document.querySelector('.locate-json-error'))`))
      throw new Error('Location leaked into new tab');
    await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('[role=tab]')).find(tab => tab.textContent.includes(${JSON.stringify(name.slice(0, 14))})).click()`
    );
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.locate-json-error'))`),
      'return to invalid tab'
    );
    await clickSelector(cdp, '.locate-json-error');
    await clickButtonByText(cdp, '修复 JSON');
    await waitFor(
      () =>
        evaluate(
          cdp,
          `!document.querySelector('.toolbar-error') && !document.querySelector('.editor-processing-layer') && window.__HANJSON_E2E_APP__.getActiveFormattedFingerprint().length > 0`
        ),
      'existing repair still succeeds'
    );
    if (await evaluate(cdp, `Boolean(document.querySelector('.locate-json-error'))`))
      throw new Error('Location remained after repair');
    console.log(JSON.stringify({ sizeMb, position, unchangedAfterLocate: true, repairPassed: true }));
    await clickButtonByText(cdp, '清空');
  }
  const eof = '{"tail":"🌍"';
  await evaluate(
    cdp,
    `window.__HANJSON_E2E_APP__.importText('missing-brace.json', ${Buffer.byteLength(eof)}, ${JSON.stringify(eof)})`
  );
  await waitFor(() => evaluate(cdp, `Boolean(document.querySelector('.locate-json-error'))`), 'EOF diagnostic');
  await clickSelector(cdp, '.locate-json-error');
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.left-editor-pane .currentSearchHighlight'))`),
    'EOF context highlighted'
  );
  samples.push({ name: 'missing-brace.json', text: eof });
  for (const sample of samples) console.log(`Manual sample: ${await saveManualJsonSample(sample.name, sample.text)}`);
  console.log(`Error location E2E passed; manual samples: ${path.resolve('json')}`);
} catch (error) {
  await collectFailureArtifacts({ cdp, stderr: app.getStderr() });
  throw error;
} finally {
  cdp?.close();
  app.child.kill('SIGTERM');
}
