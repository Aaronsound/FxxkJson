import { createRequire } from 'node:module';
import path from 'node:path';
import { saveManualJsonSample } from './manual-json-samples.mjs';
import { startElectronApp, getAvailablePort, connectAndPrepareElectronPage } from './e2e-electron-app.mjs';
import { evaluate, waitFor, pressShortcut, insertText, clickSelector, clickButtonByText } from './e2e-cdp-helpers.mjs';

const require = createRequire(import.meta.url);
const port = await getAvailablePort();
const app = await startElectronApp({
  appMain: path.resolve('dist-electron/main.js'),
  cwd: process.cwd(),
  electronCli: require.resolve('electron/cli.js'),
  port,
});
let cdp;
try {
  cdp = await connectAndPrepareElectronPage(port);
  await evaluate(
    cdp,
    `(async () => {
    const text = JSON.stringify(Array.from({length:4500}, (_,i) => ({needle:i})));
    await window.__HANJSON_E2E_APP__.importText('search-4500.json', text.length, text);
  })()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector('.right-editor-pane .monaco-editor textarea')) && !document.querySelector('.editor-processing-layer')`
      ),
    'normal editor ready'
  );
  await evaluate(cdp, `document.querySelector('.right-editor-pane .monaco-editor textarea').focus()`);
  await pressShortcut(cdp, 'f', 'KeyF');
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.right-editor-pane .pane-find-input'))`),
    'right search'
  );
  await insertText(cdp, 'needle');
  const rightCount = () => evaluate(cdp, `document.querySelector('.right-editor-pane .pane-find-count')?.textContent`);
  await waitFor(async () => (await rightCount()) === '1/2000+', 'first batch');
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.right-editor-pane .pane-find-layer button')).find(b => b.textContent === '加载更多').click()`
  );
  await waitFor(async () => (await rightCount()) === '1/4000+', 'second batch');
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.right-editor-pane .pane-find-layer button')).find(b => b.textContent === '下一个').click()`
  );
  await waitFor(async () => (await rightCount()) === '2/4000+', 'navigation preserves loaded batch');
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.right-editor-pane .pane-find-layer button')).find(b => b.textContent === '加载更多').click()`
  );
  await waitFor(async () => (await rightCount()) === '2/4500', 'all search matches');
  await evaluate(
    cdp,
    `(async () => {
    for (let i = 0; i < 2050; i++) {
      Array.from(document.querySelectorAll('.right-editor-pane .pane-find-layer button')).find(b => b.textContent === '下一个').click();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  })()`
  );
  await waitFor(async () => (await rightCount()) === '2052/4500', 'navigate beyond first batch');
  console.log('Search pagination: 2000 → 4000 → 4500; navigation reached 2052/4500 without resetting results');
  await clickSelector(cdp, '.right-editor-pane .pane-find-close');

  for (const side of ['left', 'right']) {
    await clickSelector(cdp, '.add-tab');
    await evaluate(
      cdp,
      `(async () => {
      const text = JSON.stringify({message: 'x'.repeat(20 * 1024 * 1024) + ${JSON.stringify(`-${side}-needle-🌍`)}});
      await window.__HANJSON_E2E_APP__.importText(${JSON.stringify(`long-${side}.json`)}, new TextEncoder().encode(text).length, text);
    })()`
    );
    await waitFor(
      () =>
        evaluate(
          cdp,
          `Boolean(document.querySelector('.right-editor-pane .large-json-viewer')) && !document.querySelector('.editor-processing-layer')`
        ),
      '20MB string ready',
      90000
    );
  }
  // Rapid query changes are sent as separate input events before the coalescing timer expires.
  for (const side of ['left', 'right']) {
    await evaluate(
      cdp,
      `document.querySelector('.${side}-editor-pane .large-${side === 'left' ? 'raw' : 'json'}-viewer').focus()`
    );
    await pressShortcut(cdp, 'f', 'KeyF');
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.${side}-editor-pane .pane-find-input'))`),
      `${side} search open`
    );
    await evaluate(
      cdp,
      `(() => {
      const input = document.querySelector('.${side}-editor-pane .pane-find-input');
      for (const text of ['n','ne','nee','need','needle']) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);
        input.dispatchEvent(new Event('input', {bubbles:true}));
      }
    })()`
    );
    await waitFor(
      () => evaluate(cdp, `document.querySelector('.${side}-editor-pane .pane-find-count')?.textContent === '1/1'`),
      `${side} latest query result`
    );
    await clickSelector(cdp, `.${side}-editor-pane .pane-find-close`);
  }
  console.log('20MB rapid search: both panes resolve the latest query and close normally');
  await clickButtonByText(cdp, '对比 JSON');
  await waitFor(
    () => evaluate(cdp, `document.querySelectorAll('.json-compare-selectors select').length === 2`),
    'comparison dialog ready'
  );
  await evaluate(
    cdp,
    `(() => {
    const selects = document.querySelectorAll('.json-compare-selectors select');
    for (const [i, side] of ['left','right'].entries()) {
      selects[i].value = Array.from(selects[i].options).find(option => option.textContent === 'long-' + side + '.json').value;
      selects[i].dispatchEvent(new Event('change', {bubbles:true}));
    }
  })()`
  );
  await clickButtonByText(cdp, '开始对比');
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('[aria-label="查看 $.message 的完整值"]'))`),
    'long string difference'
  );
  const began = Date.now();
  await clickSelector(cdp, '[aria-label="查看 $.message 的完整值"]');
  await waitFor(
    () => evaluate(cdp, `document.querySelectorAll('.json-compare-value pre').length === 2`),
    'first long-value sections'
  );
  const sectionMs = Date.now() - began;
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.json-compare-value button')).filter(button => button.textContent === '最后一段').forEach(button => button.click())`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Array.from(document.querySelectorAll('.json-compare-value pre')).every(node => node.textContent.includes('needle-🌍'))`
      ),
    'exact 20MB tails'
  );
  const lengths = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.json-compare-value pre')).map(node => node.textContent.length)`
  );
  if (lengths.some((length) => length > 16385)) throw new Error('Unbounded detail DOM');
  await clickButtonByText(cdp, '返回差异列表');
  await clickSelector(cdp, '[aria-label="查看 $.message 的完整值"]');
  await waitFor(
    () => evaluate(cdp, `document.querySelectorAll('.json-compare-value pre').length === 2`),
    'reader recreated after release'
  );
  console.log(JSON.stringify({ longValueMB: 20, firstSectionsMs: sectionMs, tailLengths: lengths, reopened: true }));
  await saveManualJsonSample(
    'search-4500.json',
    JSON.stringify(Array.from({ length: 4500 }, (_, i) => ({ needle: i })))
  );
  for (const side of ['left', 'right']) {
    await saveManualJsonSample(
      `long-${side}.json`,
      JSON.stringify({ message: `${'x'.repeat(20 * 1024 * 1024)}-${side}-needle-🌍` })
    );
  }
  console.log(`Manual test samples: ${path.resolve('json')}`);
} finally {
  cdp?.close();
  app.child.kill('SIGTERM');
}
