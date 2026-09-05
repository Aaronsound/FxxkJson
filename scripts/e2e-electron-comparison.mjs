import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { clickButtonByText, clickSelector, evaluate, waitFor } from './e2e-cdp-helpers.mjs';
import { connectAndPrepareElectronPage, getAvailablePort, startElectronApp } from './e2e-electron-app.mjs';
import { createSampleJson, importSampleByE2eBridge } from './e2e-json-fixtures.mjs';

const require = createRequire(import.meta.url);

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
    const batchPaths = await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.json-compare-row')).map(row => row.querySelector('code').textContent)`
    );
    if (batchPaths.length !== (count === 5000 ? 1000 : 2000)) throw new Error('Unexpected rendered batch size');
    paths.push(...batchPaths);
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
    });
    child = app.child;
    cdp = await connectAndPrepareElectronPage(port);
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
    if (sizeMb === 2) await runPagination(cdp, tempDir);
  } finally {
    cdp?.close();
    child?.kill('SIGTERM');
    await rm(tempDir, { recursive: true, force: true });
  }
}

for (const sizeMb of [2, 20, 40]) await runSize(sizeMb);
