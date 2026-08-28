import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clickButtonByText, clickSelector, evaluate, waitFor } from './e2e-cdp-helpers.mjs';
import { connectAndPrepareElectronPage, getAvailablePort, startElectronApp } from './e2e-electron-app.mjs';
import { createSampleJson, importSampleByE2eBridge } from './e2e-json-fixtures.mjs';

const require = createRequire(import.meta.url);
const VIEWPORT = { height: 860, width: 1365 };

async function captureScreenshot(cdp, outputPath) {
  await evaluate(
    cdp,
    `Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2000))])
      .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))`
  );
  const screenshot = await cdp.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
    fromSurface: true,
  });
  await writeFile(outputPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Captured ${path.relative(process.cwd(), outputPath)}`);
}

async function closeFloatingUi(cdp) {
  await evaluate(
    cdp,
    `(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()`
  );
}

async function setLanguage(cdp, language) {
  const expectedLang = language === 'zh' ? 'zh-CN' : 'en';
  const expectedPaneTitle = language === 'zh' ? '原始 JSON' : 'Raw JSON';
  if ((await evaluate(cdp, 'document.documentElement.lang')) !== expectedLang) {
    const label = language === 'zh' ? '简体中文' : 'English';
    const changed = await evaluate(
      cdp,
      `(() => {
        document.querySelector('.toolbar-more-trigger')?.click();
        document.querySelector('.toolbar-language-menu:not(.toolbar-theme-menu) > .toolbar-language-trigger')?.click();
        const option = Array.from(document.querySelectorAll('.toolbar-language-menu:not(.toolbar-theme-menu) .toolbar-language-option'))
          .find((element) => element.textContent?.includes(${JSON.stringify(label)}));
        if (!(option instanceof HTMLElement)) return false;
        option.click();
        return true;
      })()`
    );
    if (!changed) throw new Error(`Could not switch documentation UI to ${language}`);
  }

  await waitFor(
    () =>
      evaluate(
        cdp,
        `document.documentElement.lang === ${JSON.stringify(expectedLang)} &&
          document.querySelector('.left-editor-pane .editor-pane-header-title')?.textContent === ${JSON.stringify(expectedPaneTitle)}`
      ),
    `${language} UI`
  );
}

async function setEmeraldTheme(cdp) {
  if ((await evaluate(cdp, `document.documentElement.dataset.accentTheme`)) === 'emerald') return;
  const changed = await evaluate(
    cdp,
    `(() => {
      document.querySelector('.toolbar-more-trigger')?.click();
      document.querySelector('.toolbar-theme-menu > .toolbar-language-trigger')?.click();
      const option = document.querySelector('[data-accent-theme-option="emerald"]');
      if (!(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    })()`
  );
  if (!changed) throw new Error('Could not switch documentation UI to emerald');
  await waitFor(
    () => evaluate(cdp, `document.documentElement.dataset.accentTheme === 'emerald'`),
    'emerald documentation theme'
  );
}

async function setToolbarCheckbox(cdp, index, checked) {
  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelectorAll('.toolbar-checkbox input')[${index}];
      if (!(input instanceof HTMLInputElement)) return false;
      if (input.checked !== ${checked}) input.click();
      return true;
    })()`
  );
}

async function importText(cdp, name, content) {
  await evaluate(
    cdp,
    `(async () => {
      await window.__HANJSON_E2E_APP__.importText(
        ${JSON.stringify(name)},
        ${Buffer.byteLength(content)},
        ${JSON.stringify(content)}
      );
      return true;
    })()`
  );
}

async function captureBilingual(cdp, assetDir, baseName) {
  await setLanguage(cdp, 'zh');
  await closeFloatingUi(cdp);
  await captureScreenshot(cdp, path.join(assetDir, `${baseName}.png`));
  await setLanguage(cdp, 'en');
  await closeFloatingUi(cdp);
  await captureScreenshot(cdp, path.join(assetDir, `${baseName}-en.png`));
}

async function openNodeContextMenu(cdp) {
  const opened = await evaluate(
    cdp,
    `(() => {
      const line = Array.from(document.querySelectorAll('.right-editor-pane .large-json-line-text'))
        .find((element) => element.textContent?.includes('requestId'));
      if (!(line instanceof HTMLElement)) return false;
      const rect = line.getBoundingClientRect();
      line.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        button: 2,
        clientX: rect.left + Math.min(80, rect.width / 2),
        clientY: rect.top + rect.height / 2,
      }));
      return true;
    })()`
  );
  if (!opened) throw new Error('Could not open the documentation context menu');
  await waitFor(
    () => evaluate(cdp, `document.querySelectorAll('.large-json-context-menu-item').length >= 8`),
    'documentation context menu'
  );
}

async function captureContextMenu(cdp, assetDir, language) {
  await setLanguage(cdp, language);
  await openNodeContextMenu(cdp);
  const expectedMenuText = language === 'zh' ? '复制 JSON Path' : 'Copy JSON Path';
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Array.from(document.querySelectorAll('.large-json-context-menu-item')).some((element) => element.textContent === ${JSON.stringify(expectedMenuText)})`
      ),
    `${language} documentation context menu labels`
  );
  const suffix = language === 'zh' ? '' : '-en';
  await captureScreenshot(cdp, path.join(assetDir, `context-menu${suffix}.png`));
  await closeFloatingUi(cdp);
}

async function openAndRunCompare(cdp, language) {
  await clickButtonByText(cdp, language === 'zh' ? '对比 JSON' : 'Compare JSON');
  await waitFor(() => evaluate(cdp, `Boolean(document.querySelector('.json-compare-card'))`), 'compare dialog');
  await clickButtonByText(cdp, language === 'zh' ? '开始对比' : 'Compare');
  await waitFor(() => evaluate(cdp, `document.querySelectorAll('.json-compare-row').length >= 3`), 'compare results');
}

async function captureCompare(cdp, assetDir, language) {
  await setLanguage(cdp, language);
  await openAndRunCompare(cdp, language);
  const suffix = language === 'zh' ? '' : '-en';
  await captureScreenshot(cdp, path.join(assetDir, `compare-dialog${suffix}.png`));
  await clickButtonByText(cdp, language === 'zh' ? '关闭' : 'Close');
  await waitFor(() => evaluate(cdp, `!document.querySelector('.json-compare-card')`), 'compare dialog closed');
}

async function run() {
  const cwd = process.cwd();
  const assetDir = path.join(cwd, 'docs/assets');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-doc-screenshots-'));
  const port = await getAvailablePort();
  const electronCli = require.resolve('electron/cli.js');
  const appMain = path.join(cwd, 'dist-electron/main.js');
  let child = null;
  let cdp = null;

  await mkdir(assetDir, { recursive: true });
  try {
    const electronApp = await startElectronApp({ appMain, cwd, electronCli, port });
    child = electronApp.child;
    cdp = await connectAndPrepareElectronPage(port);
    console.log('Connected to the documentation Electron window');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1,
      height: VIEWPORT.height,
      mobile: false,
      width: VIEWPORT.width,
    });
    await setEmeraldTheme(cdp);
    await setToolbarCheckbox(cdp, 0, false);
    await setToolbarCheckbox(cdp, 2, false);
    console.log('Prepared deterministic documentation preferences');

    const mainJson = JSON.stringify({
      project: 'FxxkJson',
      privacy: 'local-first',
      features: ['format', 'repair', 'search', 'compare', 'large JSON'],
      theme: 'customizable',
      nested: { enabled: true, requestId: 'req-docs-0001' },
    });
    await importText(cdp, 'Welcome.json', mainJson);
    await waitFor(() => evaluate(cdp, `document.body.innerText.includes('req-docs-0001')`), 'main documentation JSON');
    console.log('Prepared the main-window sample');
    await captureBilingual(cdp, assetDir, 'main-window');

    await setLanguage(cdp, 'zh');
    const largeSamplePath = path.join(tempDir, 'sample-5mb.json');
    await writeFile(largeSamplePath, createSampleJson(5 * 1024 * 1024), 'utf8');
    await importSampleByE2eBridge(cdp, largeSamplePath);
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.right-editor-pane .large-json-viewer'))`),
      'large documentation viewer',
      90000
    );
    console.log('Prepared the large-file sample');
    await captureBilingual(cdp, assetDir, 'large-json-viewer');
    await captureContextMenu(cdp, assetDir, 'zh');
    await captureContextMenu(cdp, assetDir, 'en');

    await setLanguage(cdp, 'zh');
    await clickButtonByText(cdp, '清空');
    const baseline = JSON.stringify({
      project: 'FxxkJson',
      version: 1,
      enabled: true,
      features: ['format', 'repair', 'search'],
      nested: { requestId: 'req-compare-0001' },
    });
    const candidate = JSON.stringify({
      project: 'FxxkJson',
      version: 2,
      enabled: true,
      features: ['format', 'repair', 'search', 'themes'],
      nested: { requestId: 'req-compare-0002' },
      localOnly: true,
    });
    await importText(cdp, 'Baseline.json', baseline);
    await clickSelector(cdp, '.add-tab');
    await waitFor(() => evaluate(cdp, `document.querySelectorAll('.tab-bar .tab').length >= 2`), 'comparison tab');
    await importText(cdp, 'Candidate.json', candidate);
    console.log('Prepared the comparison samples');
    await captureCompare(cdp, assetDir, 'zh');
    await captureCompare(cdp, assetDir, 'en');
    await setLanguage(cdp, 'zh');

    console.log('Documentation screenshots captured successfully');
  } finally {
    cdp?.close();
    if (child && !child.killed) child.kill();
    await rm(tempDir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
