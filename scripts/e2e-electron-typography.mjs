import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clickButtonByText, evaluate, waitFor } from './e2e-cdp-helpers.mjs';
import {
  collectFailureArtifacts,
  connectAndPrepareElectronPage,
  getAvailablePort,
  startElectronApp,
} from './e2e-electron-app.mjs';
import { createSampleJson, importSampleByE2eBridge } from './e2e-json-fixtures.mjs';

const require = createRequire(import.meta.url);
const EXPECTED_FONT_SIZE = '12px';
const EXPECTED_LINE_HEIGHT = '18px';
const EXPECTED_FONT_FAMILY_PATTERN = /Menlo|Monaco|Courier New|monospace/i;

async function importText(cdp, fileName, text) {
  await evaluate(
    cdp,
    `(async () => {
      const text = ${JSON.stringify(text)};
      await window.__HANJSON_E2E_APP__.importText(
        ${JSON.stringify(fileName)},
        new TextEncoder().encode(text).length,
        text
      );
      return true;
    })()`
  );
}

async function readTypography(cdp, selector) {
  const style = await evaluate(
    cdp,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight
      };
    })()`
  );

  if (!style) {
    throw new Error(`Could not find typography target ${selector}`);
  }

  return style;
}

function assertEditorTypography(label, style) {
  if (!EXPECTED_FONT_FAMILY_PATTERN.test(style.fontFamily)) {
    throw new Error(`${label} font family drifted: ${style.fontFamily}`);
  }

  if (style.fontSize !== EXPECTED_FONT_SIZE) {
    throw new Error(`${label} font size drifted: ${style.fontSize}`);
  }

  if (style.lineHeight !== EXPECTED_LINE_HEIGHT) {
    throw new Error(`${label} line height drifted: ${style.lineHeight}`);
  }

  if (style.fontWeight !== '400') {
    throw new Error(`${label} font weight drifted: ${style.fontWeight}`);
  }

  if (style.letterSpacing !== 'normal' && style.letterSpacing !== '0px') {
    throw new Error(`${label} letter spacing drifted: ${style.letterSpacing}`);
  }
}

async function assertTypography(cdp, label, selector) {
  assertEditorTypography(label, await readTypography(cdp, selector));
}

async function run() {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.HANJSON_E2E_FORCE) {
    console.log('FxxkJson typography E2E skipped: no DISPLAY is available on Linux');
    return;
  }

  const cwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-typography-e2e-'));
  const port = await getAvailablePort();
  const electronCli = require.resolve('electron/cli.js');
  const appMain = path.join(cwd, 'dist-electron/main.js');
  let child = null;
  let cdp = null;
  let getStderr = () => '';

  try {
    const electronApp = await startElectronApp({
      appMain,
      cwd,
      electronCli,
      port,
    });
    child = electronApp.child;
    getStderr = electronApp.getStderr;

    cdp = await connectAndPrepareElectronPage(port);

    await importText(cdp, 'typography-small.json', '{"name":"FxxkJson","ok":true,"count":3}');
    await waitFor(() => evaluate(cdp, `document.body.innerText.includes('"FxxkJson"')`), 'small JSON formatted');

    await assertTypography(cdp, 'left editor', '.left-editor-pane .monaco-editor .view-lines');
    await assertTypography(cdp, 'right editor', '.right-editor-pane .monaco-editor .view-lines');

    await clickButtonByText(cdp, '编辑 JSON');
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.modal-editor-shell .monaco-editor .view-lines'))`),
      'edit modal editor'
    );
    await assertTypography(cdp, 'edit modal editor', '.modal-editor-shell .monaco-editor .view-lines');
    await clickButtonByText(cdp, '取消');

    const largeSamplePath = path.join(tempDir, 'typography-large.json');
    await writeFile(largeSamplePath, createSampleJson(6 * 1024 * 1024), 'utf8');
    await importSampleByE2eBridge(cdp, largeSamplePath);
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.right-editor-pane .large-json-viewer'))`),
      'large JSON viewer',
      90000
    );
    await assertTypography(cdp, 'large JSON viewer', '.right-editor-pane .large-json-viewer');
    await assertTypography(cdp, 'large raw viewer', '.left-editor-pane .large-raw-viewer');

    console.log('FxxkJson typography E2E passed');
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
