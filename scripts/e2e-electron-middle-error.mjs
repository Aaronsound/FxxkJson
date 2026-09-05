import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createScanner, SyntaxKind } from 'jsonc-parser';
import { saveManualJsonSample } from './manual-json-samples.mjs';
import { captureElectronScreenshot } from './e2e-screenshot.mjs';
import {
  startElectronApp,
  getAvailablePort,
  connectAndPrepareElectronPage,
  collectFailureArtifacts,
} from './e2e-electron-app.mjs';
import { evaluate, waitFor, clickSelector } from './e2e-cdp-helpers.mjs';
import { createSampleJson } from './e2e-json-fixtures.mjs';

// Use the regular many-record sample, not a single long string or an EOF-only error.
let originalPath = path.resolve(
  'json',
  process.argv.includes('--generated') ? 'error-edit-source-20mb.json' : 'sample-20mb.json'
);
let original;
try {
  original = await readFile(originalPath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  original = createSampleJson(20 * 1024 * 1024);
  originalPath = await saveManualJsonSample('error-edit-source-20mb.json', original);
}
JSON.parse(original);
const scanner = createScanner(original, true);
let removedOffset = -1;
let expectedOffset = -1;
let expectedToken = '';
for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
  if (token !== SyntaxKind.CommaToken || scanner.getTokenOffset() < original.length / 2) continue;
  const offset = scanner.getTokenOffset();
  if (scanner.scan() !== SyntaxKind.StringLiteral) continue;
  removedOffset = offset;
  expectedOffset = scanner.getTokenOffset() - 1;
  expectedToken = scanner.getTokenValue();
  break;
}
assert.ok(removedOffset >= original.length * 0.49 && removedOffset < original.length * 0.51);
const broken = original.slice(0, removedOffset) + original.slice(removedOffset + 1);
assert.equal(broken.length, original.length - 1);
assert.equal(`${broken.slice(0, removedOffset)},${broken.slice(removedOffset)}`, original);
assert.throws(() => JSON.parse(broken), SyntaxError);
const outputPath = await saveManualJsonSample('sample-20mb-middle-missing-comma.json', broken);
console.log(
  JSON.stringify({
    outputPath,
    removedOffset,
    percent: (100 * removedOffset) / original.length,
    context: broken.slice(removedOffset - 35, removedOffset + 65),
  })
);

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
    `window.__HANJSON_E2E_APP__.importText(${JSON.stringify(path.basename(outputPath))}, ${Buffer.byteLength(broken)}, ${JSON.stringify(broken)})`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector('.locate-json-error')) && !document.querySelector('.editor-processing-layer')`
      ),
    'middle error ready'
  );
  const before = await evaluate(cdp, 'window.__HANJSON_E2E_APP__.getActiveRawFingerprint()');
  const prefix = broken.slice(0, expectedOffset);
  const line = prefix.split('\n').length;
  const column = expectedOffset - prefix.lastIndexOf('\n');
  const label = await evaluate(cdp, `document.querySelector('.json-error-position').textContent`);
  assert.ok(label.includes(`第 ${line} 行，第 ${column} 列`), label);
  await clickSelector(cdp, '.locate-json-error');
  const located = await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
    const viewer = document.querySelector('.left-editor-pane .large-raw-viewer');
    const marks = Array.from(viewer?.querySelectorAll('[data-large-raw-highlight="true"]') ?? []);
    // Invalid tokenization can split one key across several syntax spans.
    // Check the complete selected text and every fragment, not just the first quote.
    const selected = marks.map(mark => mark.textContent).join('');
    if (!marks.length || !selected.includes(${JSON.stringify(expectedToken)})) return false;
    const v = viewer.getBoundingClientRect();
    if (marks.some(mark => {
      const r = mark.getBoundingClientRect();
      return r.top < v.top || r.bottom > v.bottom || r.left >= v.right || r.right <= v.left;
    })) return false;
    return {text:selected, scrollRatio:viewer.scrollTop / viewer.scrollHeight};
  })()`
      ),
    'middle token visible'
  );
  assert.ok(located.scrollRatio > 0.35 && located.scrollRatio < 0.65);
  assert.deepEqual(await evaluate(cdp, 'window.__HANJSON_E2E_APP__.getActiveRawFingerprint()'), before);
  assert.equal(await readFile(originalPath, 'utf8'), original);
  const openStartedAt = Date.now();
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.toolbar button')).find(b => b.textContent.trim() === '编辑 JSON').click()`
  );
  await waitFor(() => evaluate(cdp, `Boolean(window.__HANJSON_E2E_EDIT_MODAL__?.__editor)`), 'invalid raw editor open');
  const selection = await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
    const editor = window.__HANJSON_E2E_EDIT_MODAL__?.__editor;
    const model = editor?.getModel(), selection = editor?.getSelection();
    if (!model || !selection) return false;
    const offset = model.getOffsetAt(selection.getStartPosition());
    return offset === ${expectedOffset} ? {offset, selected:model.getValueInRange(selection)} : false;
  })()`
      ),
    'modal error selected'
  );
  const openMs = Date.now() - openStartedAt;
  try {
    const screenshot = await captureElectronScreenshot(cdp);
    const screenshotPath = path.join(os.tmpdir(), 'fxxkjson-invalid-raw-edit.png');
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Editor screenshot: ${screenshotPath}`);
  } catch (error) {
    console.warn(`Optional screenshot unavailable: ${error.message}`);
  }
  assert.ok(selection.selected.includes(expectedToken));
  assert.equal(await evaluate(cdp, `window.__HANJSON_E2E_EDIT_MODAL__.getValue().length`), broken.length);

  // A failed save must keep the draft and original unchanged, and locate the error inside the modal.
  await clickSelector(cdp, '.modal-actions button:first-child');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `document.querySelector('.modal-error[role="alert"]')?.textContent.includes('保存 JSON 失败') && !document.querySelector('.modal-actions button').disabled`
      ),
    'failed save retains editor'
  );
  assert.equal(await evaluate(cdp, `window.__HANJSON_E2E_EDIT_MODAL__.getValue().length`), broken.length);
  assert.deepEqual(await evaluate(cdp, 'window.__HANJSON_E2E_APP__.getActiveRawFingerprint()'), before);

  await evaluate(
    cdp,
    `(() => {
    const editor = window.__HANJSON_E2E_EDIT_MODAL__.__editor;
    const p = editor.getModel().getPositionAt(${removedOffset});
    editor.executeEdits('test-fix', [{range:{startLineNumber:p.lineNumber,startColumn:p.column,endLineNumber:p.lineNumber,endColumn:p.column},text:','}]);
  })()`
  );
  await waitFor(
    () => evaluate(cdp, `!document.querySelector('.modal-error[role="alert"]')`),
    'stale error cleared after typing'
  );
  const fixed = await evaluate(cdp, 'window.__HANJSON_E2E_EDIT_MODAL__.getValue()');
  assert.equal(fixed, original);
  await clickSelector(cdp, '.modal-actions button:first-child');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `!document.querySelector('#json-edit-title') && !document.querySelector('.locate-json-error') && !document.querySelector('.editor-processing-layer') && Boolean(document.querySelector('.right-editor-pane .large-json-viewer'))`
      ),
    'corrected JSON saved and formatted'
  );
  console.log(JSON.stringify({ invalidEditPassed: true, openMs, exactRawRestored: true, failedSaveKeptDraft: true }));
  const savedFingerprint = await evaluate(cdp, 'window.__HANJSON_E2E_APP__.getActiveRawFingerprint()');
  let hash = 2166136261;
  for (let index = 0; index < original.length; index++)
    hash = Math.imul(hash ^ original.charCodeAt(index), 16777619) >>> 0;
  assert.equal(savedFingerprint.hash, hash);
  assert.equal(savedFingerprint.length, original.length);

  for (const [name, text] of [
    [
      'edit-nested-missing-comma.json',
      '{\n  "outer": {\n    "a": 1\n    "b": 2\n  },\n  "other": {\n    "c": 3\n  }\n}',
    ],
    ['edit-missing-brace.json', '{"tail":"🌍"'],
  ]) {
    await saveManualJsonSample(name, text);
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
      'small invalid ready'
    );
    const originalFingerprint = await evaluate(cdp, 'window.__HANJSON_E2E_APP__.getActiveRawFingerprint()');
    await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.toolbar button')).find(b => b.textContent.trim() === '编辑 JSON').click()`
    );
    await waitFor(() => evaluate(cdp, `Boolean(window.__HANJSON_E2E_EDIT_MODAL__?.__editor)`), 'small editor open');
    if (name.includes('nested')) {
      await waitFor(
        () => evaluate(cdp, `Boolean(document.querySelector('.edit-modal-fold-button[data-line-number="2"]'))`),
        'nested fold ready'
      );
      await clickSelector(cdp, '.edit-modal-fold-button[data-line-number="6"]');
      await clickSelector(cdp, '.edit-modal-fold-button[data-line-number="2"]');
      await clickSelector(cdp, '.modal-actions button:first-child');
      await waitFor(
        () =>
          evaluate(
            cdp,
            `Boolean(document.querySelector('.modal-error[role="alert"]')?.textContent.includes('保存 JSON 失败')) && Boolean(document.querySelector('.edit-modal-fold-button.expanded[data-line-number="2"]')) && Boolean(document.querySelector('.edit-modal-fold-button.collapsed[data-line-number="6"]'))`
          ),
        'only error ancestors unfolded'
      );
      assert.equal(await evaluate(cdp, 'window.__HANJSON_E2E_EDIT_MODAL__.__editor.getSelection().startLineNumber'), 4);
    }
    await clickSelector(cdp, '.modal-actions button:last-child');
    await waitFor(() => evaluate(cdp, `!document.querySelector('#json-edit-title')`), 'cancel closes');
    assert.deepEqual(await evaluate(cdp, 'window.__HANJSON_E2E_APP__.getActiveRawFingerprint()'), originalFingerprint);
    console.log(JSON.stringify({ cancelPreservesRaw: true, sample: name }));
  }
  console.log(JSON.stringify({ passed: true, label, ...located, originalUnchanged: true, onlyOneCommaRemoved: true }));
} catch (error) {
  await collectFailureArtifacts({ cdp, stderr: app.getStderr() });
  throw error;
} finally {
  cdp?.close();
  app.child.kill('SIGTERM');
}
