import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { clickButtonByText, clickSelector, evaluate, waitFor } from './e2e-cdp-helpers.mjs';
import { connectAndPrepareElectronPage, getAvailablePort, startElectronApp } from './e2e-electron-app.mjs';
import { createSampleJson, importSampleByE2eBridge } from './e2e-json-fixtures.mjs';

const require = createRequire(import.meta.url);

async function runVariableRows(cdp, tempDir) {
  await clickSelector(cdp, '.json-compare-card .about-dialog-close');
  for (const side of ['left', 'right']) {
    const fixture = path.join(tempDir, `wrapped-${side}.json`);
    const data = Array.from({ length: 120 }, (_, index) => ({
      [`字段-${'长路径🌍'.repeat(index % 5 === 0 ? 50 : 1)}`]: `${side}-${'多行内容'.repeat(index % 3 === 0 ? 50 : 1)}`,
    }));
    await writeFile(fixture, JSON.stringify(data));
    await clickSelector(cdp, '.add-tab');
    await importSampleByE2eBridge(cdp, fixture);
    await waitFor(
      () => evaluate(cdp, `!document.querySelector('.editor-processing-layer')`),
      'wrapped fixture imported'
    );
  }
  await clickButtonByText(cdp, '对比 JSON');
  await evaluate(
    cdp,
    `(() => {
    const selects = document.querySelectorAll('.json-compare-selectors select');
    for (const [index, side] of ['left', 'right'].entries()) {
      selects[index].value = Array.from(selects[index].options).find(option => option.textContent === 'wrapped-' + side + '.json').value;
      selects[index].dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`
  );
  await clickButtonByText(cdp, '开始对比');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.json-compare-summary')?.textContent.includes('修改 120')`),
    'variable-height results'
  );
  for (const width of [480, 1100]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
    const result = await evaluate(
      cdp,
      `(async () => {
      const list = document.querySelector('.json-compare-list');
      list.scrollTop = 0;
      const seen = new Set();
      let maxRows = 0;
      for (let step = 0; step < 2000; step++) {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rows = Array.from(list.querySelectorAll('.json-compare-row'));
        maxRows = Math.max(maxRows, rows.length);
        for (let i = 0; i < rows.length; i++) {
          seen.add(Number(rows[i].dataset.diffIndex));
          const next = rows[i + 1];
          if (next && rows[i].getBoundingClientRect().bottom > next.getBoundingClientRect().top + 1) throw new Error('Wrapped rows overlap');
          if (rows[i].scrollHeight > rows[i].clientHeight + 2) throw new Error('Wrapped row clipped');
        }
        const top = list.scrollTop;
        list.scrollTop += Math.max(100, list.clientHeight * 0.8);
        if (top === list.scrollTop) break;
      }
      return { count: seen.size, maxRows };
    })()`
    );
    if (result.count !== 120 || result.maxRows > 80)
      throw new Error(`Variable-height ${width}px: ${JSON.stringify(result)}`);
    console.log(JSON.stringify({ variableHeightWidth: width, ...result }));
  }
  // Native keyboard navigation across the virtual boundary, not programmatic clicks.
  await evaluate(cdp, `(() => { const list = document.querySelector('.json-compare-list'); list.scrollTop = 0; })()`);
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('[data-diff-index="19"] button'))`),
    'keyboard boundary ready'
  );
  await evaluate(cdp, `document.querySelector('[data-diff-index="19"] button').focus()`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await waitFor(
    () => evaluate(cdp, `document.activeElement?.closest('[data-diff-index]')?.dataset.diffIndex === '20'`),
    'Tab advances to unmounted block'
  );
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    modifiers: 8,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    modifiers: 8,
  });
  await waitFor(
    () => evaluate(cdp, `document.activeElement?.closest('[data-diff-index]')?.dataset.diffIndex === '19'`),
    'Shift+Tab returns'
  );
  if (process.env.HANJSON_COMPARE_LIST_SCREENSHOT) {
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(process.env.HANJSON_COMPARE_LIST_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

async function runPrecisionAndDetails(cdp, tempDir) {
  await clickSelector(cdp, '.json-compare-card .about-dialog-close');
  const prefix = '长文本🌍'.repeat(8000);
  for (const [name, number, suffix] of [
    ['exact-left.json', '9007199254740993', 'LEFT-END'],
    ['exact-right.json', '9007199254740994', 'RIGHT-END'],
  ]) {
    const fixture = path.join(tempDir, name);
    await writeFile(fixture, '{"id":' + number + ',"message":' + JSON.stringify(prefix + suffix) + '}');
    await clickSelector(cdp, '.add-tab');
    await importSampleByE2eBridge(cdp, fixture);
    await waitFor(() => evaluate(cdp, `!document.querySelector('.editor-processing-layer')`), 'exact fixture imported');
  }
  await clickButtonByText(cdp, '对比 JSON');
  await evaluate(
    cdp,
    `(() => {
    const [left, right] = document.querySelectorAll('.json-compare-selectors select');
    for (const [select, name] of [[left, 'exact-left.json'], [right, 'exact-right.json']]) {
      select.value = Array.from(select.options).find(option => option.textContent === name).value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`
  );
  await clickButtonByText(cdp, '开始对比');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.json-compare-card')?.textContent.includes('共 2 处差异')`),
    'precise integer and string changes'
  );
  await clickSelector(cdp, '[aria-label="查看 $.id 的完整值"]');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Array.from(document.querySelectorAll('.json-compare-value pre')).map(node => node.textContent).join('|') === '9007199254740993|9007199254740994'`
      ),
    'exact full number values'
  );
  await clickButtonByText(cdp, '返回差异列表');
  await clickSelector(cdp, '[aria-label="查看 $.message 的完整值"]');
  await waitFor(
    () => evaluate(cdp, `document.querySelectorAll('.json-compare-value pre').length === 2`),
    'value sections ready'
  );
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.json-compare-value button')).filter(button => button.textContent === '最后一段').forEach(button => button.click())`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Array.from(document.querySelectorAll('.json-compare-value pre')).every(node => node.textContent.includes('-END'))`
      ),
    'long value tails visible'
  );
  const clipboard = await evaluate(cdp, 'window.electronAPI.readClipboardText()');
  try {
    await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.json-compare-value'))[1].querySelectorAll('button')[3].click()`
    );
    await waitFor(
      () =>
        evaluate(
          cdp,
          `window.electronAPI.readClipboardText().then(text => text === ${JSON.stringify(JSON.stringify(prefix + 'RIGHT-END'))})`
        ),
      'copy includes full value, not only its final section'
    );
  } finally {
    await evaluate(cdp, `window.electronAPI.writeClipboardText(${JSON.stringify(clipboard)})`);
  }
  console.log('Comparison details: exact integers, long-value sections, and full clipboard contents passed');
  if (process.env.HANJSON_COMPARE_SCREENSHOT) {
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(process.env.HANJSON_COMPARE_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 480,
    height: 760,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(() => evaluate(cdp, 'window.innerWidth === 480'), 'compact details layout');
  const overflow = await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.json-compare-value-actions button')).some(button => button.getBoundingClientRect().right > innerWidth)`
  );
  if (overflow) throw new Error('Full-value actions overflow the compact viewport');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

async function runPagination(cdp, tempDir) {
  await clickSelector(cdp, '.json-compare-card .about-dialog-close');
  for (const [name, value] of [
    ['many-left.json', 0],
    ['many-right.json', 1],
  ]) {
    const fixture = path.join(tempDir, name);
    await writeFile(fixture, JSON.stringify(Array(5000).fill(value)));
    await clickSelector(cdp, '.add-tab');
    await importSampleByE2eBridge(cdp, fixture);
    await waitFor(() => evaluate(cdp, `!document.querySelector('.editor-processing-layer')`), 'batch fixture imported');
  }
  await clickButtonByText(cdp, '对比 JSON');
  await evaluate(
    cdp,
    `(() => {
    const [left, right] = document.querySelectorAll('.json-compare-selectors select');
    for (const [select, name] of [[left, 'many-left.json'], [right, 'many-right.json']]) {
      select.value = Array.from(select.options).find(option => option.textContent === name).value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`
  );
  await clickButtonByText(cdp, '开始对比');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.json-compare-card')?.textContent.includes('已加载 2000 处差异')`),
    'first 2000 differences'
  );
  const paths = [];
  for (const count of [2000, 4000, 5000]) {
    if (count > 2000) {
      await clickButtonByText(cdp, '继续加载');
      await waitFor(
        () => evaluate(cdp, `document.querySelector('.json-compare-summary')?.textContent.includes('修改 ${count}')`),
        `loaded ${count} differences`
      );
    }
    const scan = await evaluate(
      cdp,
      `(async () => {
        const list = document.querySelector('.json-compare-list');
        const found = new Map();
        let maxRows = 0;
        for (let step = 0; step < 2000; step++) {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const rows = Array.from(list.querySelectorAll('.json-compare-row'));
          maxRows = Math.max(maxRows, rows.length);
          for (const row of rows) {
            const index = Number(row.dataset.diffNumber);
            const text = row.querySelector('code').textContent;
            if (found.has(index) && found.get(index) !== text) throw new Error('Row identity changed');
            found.set(index, text);
          }
          const previous = list.scrollTop;
          list.scrollTop += Math.max(100, list.clientHeight * 0.8);
          if (list.scrollTop === previous) break;
        }
        return { paths: Array.from(found).sort((a,b) => a[0]-b[0]).map(entry => entry[1]), maxRows };
      })()`
    );
    if (scan.paths.length !== (count === 5000 ? 1000 : 2000))
      throw new Error(`Missing virtual rows: ${scan.paths.length}`);
    if (scan.maxRows > 80) throw new Error(`Unbounded DOM: ${scan.maxRows} rows`);
    console.log(JSON.stringify({ loaded: count, maxRenderedRows: scan.maxRows }));
    paths.push(...scan.paths);
  }
  if (paths.some((value, index) => value !== `$[${index}]`) || paths.length !== 5000)
    throw new Error('Missing or duplicate differences');
  if (
    !(await evaluate(
      cdp,
      `document.querySelector('.json-compare-card').textContent.includes('已完成全部对比，共 5000 处差异。')`
    ))
  )
    throw new Error('Missing final total');
  await clickButtonByText(cdp, '上一批');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.json-compare-row code')?.textContent === '$[2000]'`),
    'previous batch'
  );
  await clickButtonByText(cdp, '上一批');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.json-compare-row code')?.textContent === '$[0]'`),
    'first cached batch'
  );
  await clickButtonByText(cdp, '下一批');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.json-compare-row code')?.textContent === '$[2000]'`),
    'next cached batch'
  );
  await evaluate(cdp, `document.querySelector('.json-compare-list').scrollTop = 6000`);
  await waitFor(
    () => evaluate(cdp, `Number(document.querySelector('.json-compare-row')?.dataset.diffIndex) > 20`),
    'middle of virtual list'
  );
  const saved = await evaluate(
    cdp,
    `(() => {
    const list = document.querySelector('.json-compare-list');
    const box = list.getBoundingClientRect();
    const button = Array.from(list.querySelectorAll('button')).find(button => {
      const rect = button.getBoundingClientRect(); return rect.top > box.top + 40 && rect.bottom < box.bottom;
    });
    const saved = { top: list.scrollTop, label: button.getAttribute('aria-label') };
    button.click();
    return saved;
  })()`
  );
  await waitFor(() => evaluate(cdp, `document.activeElement?.textContent === '返回差异列表'`), 'detail keyboard focus');
  await clickButtonByText(cdp, '返回差异列表');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Math.abs(document.querySelector('.json-compare-list').scrollTop - ${saved.top}) < 2 && document.activeElement?.getAttribute('aria-label') === ${JSON.stringify(saved.label)}`
      ),
    'scroll and focus restored'
  );
  console.log('Comparison pagination: all 5000 paths verified, no missing/duplicate rows, cached navigation passed');
}

async function waitForImport(cdp) {
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector('.right-editor-pane')?.textContent?.includes('req-e2e-000000') && !document.querySelector('.editor-processing-layer'))`
      ),
    'comparison fixture ready',
    90000
  );
}

async function runSize(sizeMb) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-compare-'));
  let child;
  let cdp;
  try {
    const fixture = path.join(tempDir, `compare-${sizeMb}mb.json`);
    await writeFile(fixture, createSampleJson(sizeMb * 1024 * 1024));
    const port = await getAvailablePort();
    const app = await startElectronApp({
      appMain: path.resolve('dist-electron/main.js'),
      cwd: process.cwd(),
      electronCli: require.resolve('electron/cli.js'),
      port,
      extraEnvironment: { HANJSON_E2E_NATIVE_IMPORT: '1', HANJSON_E2E_NATIVE_IMPORT_PATH: fixture },
    });
    child = app.child;
    cdp = await connectAndPrepareElectronPage(port);
    const cancelled = await evaluate(
      cdp,
      `(async () => {
      const id = 'cancel-native-e2e';
      return await window.electronAPI.openJsonFile(() => window.electronAPI.cancelJsonFileImport(id), id) === null;
    })()`
    );
    if (!cancelled) throw new Error('Native selection cancellation did not settle');
    await importSampleByE2eBridge(cdp, fixture);
    await waitForImport(cdp);
    await clickSelector(cdp, '.add-tab');
    await importSampleByE2eBridge(cdp, fixture);
    await waitForImport(cdp);
    await clickButtonByText(cdp, '对比 JSON');
    await waitFor(() => evaluate(cdp, `Boolean(document.querySelector('.json-compare-card'))`), 'comparison opened');
    await evaluate(
      cdp,
      `(() => {
      const card = document.querySelector('.json-compare-card');
      window.__comparisonTicks = 0;
      window.__comparisonStart = performance.now();
      const timer = setInterval(() => { window.__comparisonTicks += 1; }, 8);
      const observer = new MutationObserver(() => {
        if (!card.querySelector('.json-compare-empty')) return;
        window.__comparisonMs = performance.now() - window.__comparisonStart;
        clearInterval(timer);
        observer.disconnect();
      });
      observer.observe(card, { childList: true, subtree: true });
      card.querySelector('.json-compare-selectors button').click();
    })()`
    );
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.json-compare-empty')?.textContent?.includes('一致'))`),
      'identical large documents compared',
      90000
    );
    console.log(
      JSON.stringify({
        sizeMb,
        ...(await evaluate(
          cdp,
          `({ elapsedMs: Math.round(window.__comparisonMs), responsiveTicks: window.__comparisonTicks })`
        )),
      })
    );

    // Results must disappear immediately when the input pair changes.
    await evaluate(
      cdp,
      `(() => {
      const [left, right] = document.querySelectorAll('.json-compare-selectors select');
      right.value = left.value;
      right.dispatchEvent(new Event('change', { bubbles: true }));
    })()`
    );
    await waitFor(
      () =>
        evaluate(
          cdp,
          `!document.querySelector('.json-compare-empty') && document.querySelector('.json-compare-selectors button')?.disabled`
        ),
      'old result cleared'
    );
    await clickSelector(cdp, '.json-compare-card .about-dialog-close');

    // Closing while a fresh worker is running must not reopen or update the dialog.
    await clickButtonByText(cdp, '对比 JSON');
    await evaluate(
      cdp,
      `(() => {
      const card = document.querySelector('.json-compare-card');
      card.querySelector('.json-compare-selectors button').click();
      card.querySelector('.about-dialog-close').click();
    })()`
    );
    await waitFor(() => evaluate(cdp, `!document.querySelector('.json-compare-card')`), 'running comparison cancelled');
    await clickButtonByText(cdp, '对比 JSON');
    if (
      await evaluate(
        cdp,
        `Boolean(document.querySelector('.json-compare-empty') || document.querySelector('.json-compare-row'))`
      )
    ) {
      throw new Error('Cancelled comparison leaked results into a new dialog');
    }
    console.log(`Comparison ${sizeMb}MB: result reset, cancellation, and reopening passed`);
    if (sizeMb === 2) {
      await runPagination(cdp, tempDir);
      await runVariableRows(cdp, tempDir);
      await runPrecisionAndDetails(cdp, tempDir);
    }
  } finally {
    cdp?.close();
    child?.kill('SIGTERM');
    await rm(tempDir, { recursive: true, force: true });
  }
}

for (const sizeMb of [2, 20, 40]) await runSize(sizeMb);
