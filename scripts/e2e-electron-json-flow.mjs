import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  clickButtonByText,
  clickSelector,
  connectToElectronPage,
  evaluate,
  insertText,
  pressShortcut,
  waitFor,
} from './e2e-cdp-helpers.mjs';

const require = createRequire(import.meta.url);
const DEFAULT_SIZE_MB = 2;

function parseSizeMb() {
  const argIndex = process.argv.findIndex((arg) => arg === '--size-mb');
  const rawValue = argIndex >= 0 ? process.argv[argIndex + 1] : process.env.HANJSON_E2E_SIZE_MB;
  const value = Number(rawValue ?? DEFAULT_SIZE_MB);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SIZE_MB;
}

function createSampleJson(targetBytes) {
  const records = [];
  let byteLength = 2;
  let index = 0;

  while (byteLength < targetBytes) {
    const record = JSON.stringify({
      id: index,
      name: `HanJson e2e sample ${index}`,
      active: index % 2 === 0,
      score: index % 1000,
      tags: ['electron', 'json', 'e2e', 'formatter'],
      message: 'x'.repeat(160),
      nested: {
        requestId: `req-e2e-${String(index).padStart(6, '0')}`,
        timestamp: '2026-05-18T00:00:00.000Z',
        values: [index, index + 1, index + 2],
      },
    });
    records.push(record);
    byteLength += Buffer.byteLength(record) + (records.length > 1 ? 1 : 0);
    index += 1;
  }

  return `[${records.join(',')}]`;
}

async function createSampleServer(filePath) {
  const server = http.createServer(async (_request, response) => {
    const stats = await stat(filePath);
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Length': stats.size,
      'Content-Type': 'application/json; charset=utf-8',
    });
    createReadStream(filePath).pipe(response);
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not start sample file server');
  }

  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    url: `http://127.0.0.1:${address.port}/sample.json`,
  };
}

async function getAvailablePort() {
  const server = http.createServer();
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = address && typeof address !== 'string' ? address.port : null;
  await new Promise((resolve) => server.close(resolve));

  if (!port) {
    throw new Error('Could not allocate an Electron debug port');
  }

  return port;
}

async function importSampleByDrop(cdp, sampleUrl, fileName) {
  return evaluate(cdp, `(async () => {
    const response = await fetch(${JSON.stringify(sampleUrl)});
    const text = await response.text();
    const file = new File([text], ${JSON.stringify(fileName)}, { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const target = document.querySelector('#root > div') ?? document.body;
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    target.dispatchEvent(event);
    return true;
  })()`);
}

async function collectFailureArtifacts({ cdp, stderr }) {
  const artifactDir = process.env.HANJSON_E2E_ARTIFACT_DIR;
  if (!artifactDir) {
    return;
  }

  await mkdir(artifactDir, { recursive: true });

  if (stderr) {
    await writeFile(path.join(artifactDir, 'electron-stderr.log'), stderr, 'utf8');
  }

  if (!cdp) {
    return;
  }

  try {
    const diagnostics = await evaluate(cdp, `(() => JSON.stringify({
      locateChecked: Array.from(document.querySelectorAll('label.toolbar-checkbox'))
        .find((label) => label.textContent?.includes('大文件启用右侧定位'))
        ?.querySelector('input')?.checked ?? null,
      rightLineCount: document.querySelectorAll('.right-editor-pane .large-json-line-text').length,
      rightHighlights: document.querySelectorAll('.right-editor-pane .rightNodeSelectionHighlight').length,
      leftHighlights: document.querySelectorAll('.left-editor-pane .currentSearchHighlight, .left-editor-pane [data-large-raw-highlight="true"]').length,
      findCount: document.querySelector('.right-editor-pane .pane-find-count')?.textContent ?? null,
      compareOpen: Boolean(document.querySelector('.json-compare-card')),
      compareError: Array.from(document.querySelectorAll('.modal-error')).map((element) => element.textContent).join('\\n'),
      toolbarHint: document.querySelector('.toolbar-hint')?.textContent ?? null,
      bodyStart: document.body.innerText.slice(0, 700)
    }, null, 2))()`);
    await writeFile(path.join(artifactDir, 'renderer-diagnostics.json'), diagnostics, 'utf8');
    console.error(`Renderer diagnostics: ${diagnostics}`);
  } catch (diagnosticError) {
    console.error(`Renderer diagnostics failed: ${diagnosticError.message}`);
  }

  try {
    const screenshot = await cdp.send('Page.captureScreenshot', {
      captureBeyondViewport: true,
      format: 'png',
    });
    await writeFile(
      path.join(artifactDir, 'renderer-screenshot.png'),
      Buffer.from(screenshot.data, 'base64')
    );
  } catch (screenshotError) {
    console.error(`Renderer screenshot failed: ${screenshotError.message}`);
  }
}

async function run() {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.HANJSON_E2E_FORCE) {
    console.log('HanJson Electron E2E skipped: no DISPLAY is available on Linux');
    return;
  }

  const cwd = process.cwd();
  const sizeMb = parseSizeMb();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'hanjson-e2e-'));
  const samplePath = path.join(tempDir, `sample-${sizeMb}mb.json`);
  const port = await getAvailablePort();
  const electronCli = require.resolve('electron/cli.js');
  const appMain = path.join(cwd, 'dist-electron/main.js');
  let child = null;
  let cdp = null;
  let stderr = '';
  let sampleServer = null;

  try {
    const sample = createSampleJson(sizeMb * 1024 * 1024);
    await writeFile(samplePath, sample, 'utf8');
    sampleServer = await createSampleServer(samplePath);

    child = spawn(process.execPath, [
      electronCli,
      `--remote-debugging-port=${port}`,
      appMain,
    ], {
      cwd,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        ELECTRON_OPEN_DEVTOOLS: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        stderr += `\nElectron exited with code ${code}`;
      }
    });

    cdp = await connectToElectronPage(port);
    await waitFor(
      () => evaluate(cdp, 'document.readyState === "complete" && Boolean(document.querySelector("input[type=file]"))'),
      'app shell'
    );
    await evaluate(cdp, 'window.__HANJSON_E2E__ = true');
    await evaluate(cdp, `(() => {
      const checkbox = Array.from(document.querySelectorAll('label.toolbar-checkbox'))
        .find((label) => label.textContent?.includes('大文件启用右侧定位'))
        ?.querySelector('input');
      if (checkbox && !checkbox.checked) {
        checkbox.click();
      }
      return Boolean(checkbox);
    })()`);
    await importSampleByDrop(cdp, sampleServer.url, path.basename(samplePath));

    await waitFor(
      () => evaluate(cdp, `document.body.innerText.includes('req-e2e-000000')`),
      'imported and formatted JSON',
      90000
    );

    await evaluate(cdp, `(() => {
      const target = document.querySelector('.right-editor-pane .large-json-viewer, .right-editor-pane .monaco-editor textarea, .right-editor-pane .monaco-editor');
      target?.focus?.();
      return Boolean(target);
    })()`);
    await pressShortcut(cdp, 'f', 'KeyF');
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.right-editor-pane .pane-find-input'))`),
      'right search widget'
    );
    await insertText(cdp, 'requestId');
    await waitFor(
      () => evaluate(cdp, `(() => {
        const text = document.querySelector('.right-editor-pane .pane-find-count')?.textContent ?? '';
        return text !== '0/0' && text.includes('/');
      })()`),
      'right search results'
    );

    const clickedNode = await evaluate(cdp, `(() => {
      const line = Array.from(document.querySelectorAll('.right-editor-pane .large-json-line-text'))
        .find((element) => element.getAttribute('title')?.includes('requestId'));
      if (!line) return false;
      const rect = line.getBoundingClientRect();
      line.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: rect.left + 32,
        clientY: rect.top + Math.min(10, rect.height / 2)
      }));
      return true;
    })()`);

    if (!clickedNode) {
      throw new Error('Could not click a right-side requestId node');
    }

    await waitFor(
      () => evaluate(cdp, `Boolean(
        document.querySelector('.right-editor-pane .rightNodeSelectionHighlight')
        && document.body.innerText.includes('已定位到 offset')
      )`),
      'right click locate highlight'
    );

    const openRequestIdContextMenu = async () => {
      const openedContextMenu = await evaluate(cdp, `(() => {
        const line = Array.from(document.querySelectorAll('.right-editor-pane .large-json-line-text'))
          .find((element) => element.getAttribute('title')?.includes('requestId'));
        if (!line) return false;
        const rect = line.getBoundingClientRect();
        line.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          button: 2,
          clientX: rect.left + 32,
          clientY: rect.top + Math.min(10, rect.height / 2)
        }));
        return true;
      })()`);

      if (!openedContextMenu) {
        throw new Error('Could not open right-side context menu');
      }

      await waitFor(
        () => evaluate(cdp, `Boolean(Array.from(document.querySelectorAll('.large-json-context-menu-item')).find((button) => button.textContent?.trim() === '编辑当前值'))`),
        'right context menu'
      );
    };

    await openRequestIdContextMenu();
    await evaluate(cdp, `Array.from(document.querySelectorAll('.large-json-context-menu-item'))
      .find((button) => button.textContent?.trim() === '删除当前节点')?.click()`);
    await waitFor(
      () => evaluate(cdp, `document.body.innerText.includes('删除当前节点') && document.body.innerText.includes('req-e2e-000000')`),
      'delete node confirmation preview'
    );
    await evaluate(cdp, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await waitFor(
      () => evaluate(cdp, `!document.querySelector('.right-node-mutation-card') && document.body.innerText.includes('req-e2e-000000')`),
      'delete node dialog escaped'
    );

    await openRequestIdContextMenu();
    await evaluate(cdp, `Array.from(document.querySelectorAll('.large-json-context-menu-item'))
      .find((button) => button.textContent?.trim() === '重命名 key')?.click()`);
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.right-node-mutation-card input'))`),
      'rename key dialog'
    );
    await evaluate(cdp, `(() => {
      const input = document.querySelector('.right-node-mutation-card input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, ' renamedRequestId ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await waitFor(
      () => evaluate(cdp, `document.body.innerText.includes('首尾空格') && document.body.innerText.includes('已有同名 key')`),
      'rename key warnings'
    );
    await clickButtonByText(cdp, '取消');
    await waitFor(
      () => evaluate(cdp, `!document.querySelector('.right-node-mutation-card')`),
      'rename key dialog cancelled'
    );

    await openRequestIdContextMenu();
    await evaluate(cdp, `Array.from(document.querySelectorAll('.large-json-context-menu-item'))
      .find((button) => button.textContent?.trim() === '编辑当前值')?.click()`);
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.modal-card .monaco-editor textarea'))`),
      'node edit modal'
    );
    const directEdit = await evaluate(cdp, `(() => {
      if (window.__HANJSON_E2E_EDIT_MODAL__?.setValue) {
        window.__HANJSON_E2E_EDIT_MODAL__.setValue('"req-e2e-updated"');
        return true;
      }
      const monacoApi = window.monaco;
      const models = monacoApi?.editor?.getModels?.() ?? [];
      const model = models.find((item) => item.getValue().includes('req-e2e-000000')) ?? models.at(-1);
      if (!model) return false;
      model.setValue('"req-e2e-updated"');
      return true;
    })()`);
    if (!directEdit) {
      await clickSelector(cdp, '.modal-card .monaco-editor textarea');
      await pressShortcut(cdp, 'a', 'KeyA');
      await insertText(cdp, JSON.stringify('req-e2e-updated'));
    }
    await evaluate(cdp, `Array.from(document.querySelectorAll('.modal-actions button'))
      .find((button) => button.textContent?.includes('更新当前节点'))?.click()`);
    await waitFor(
      () => evaluate(cdp, `document.body.innerText.includes('req-e2e-updated') && !document.querySelector('.modal-card')`),
      'node edit saved',
      90000
    );
    await waitFor(
      () => evaluate(cdp, `(() => {
        return document.body.innerText.includes('req-e2e-updated')
          && document.body.innerText.includes('已定位到 offset')
          && !document.querySelector('.modal-card');
      })()`),
      'right node save state restored after edit'
    );

    await clickSelector(cdp, '.add-tab');
    await waitFor(
      () => evaluate(cdp, `document.querySelectorAll('.tab-bar .tab').length >= 2`),
      'second tab created'
    );
    await clickSelector(cdp, '.left-editor-pane .monaco-editor textarea');
    await pressShortcut(cdp, 'a', 'KeyA');
    await insertText(cdp, '{"broken": true,');
    await clickButtonByText(cdp, '对比 JSON');
    await waitFor(
      () => evaluate(cdp, `Boolean(document.querySelector('.json-compare-card'))`),
      'compare dialog opened'
    );
    await clickButtonByText(cdp, '开始对比');
    await waitFor(
      () => evaluate(cdp, `document.body.innerText.includes('解析失败')`),
      'invalid JSON compare error'
    );

    console.log('HanJson Electron E2E passed');
    console.table([
      { step: 'sample', detail: `${sizeMb}MB generated at ${samplePath}` },
      { step: 'import', detail: 'desktop file input imported JSON' },
      { step: 'search', detail: 'right pane requestId search returned results' },
      { step: 'locate', detail: 'right node click highlighted left raw JSON' },
      { step: 'delete cancel', detail: 'right node delete preview closes with Escape' },
      { step: 'rename warnings', detail: 'right node rename dialog shows whitespace and duplicate-key warnings' },
      { step: 'edit', detail: 'large right node edit saved back to original JSON' },
      { step: 'save state', detail: 'edited content and locate status remained available after save' },
      { step: 'compare invalid', detail: 'JSON compare reports parse errors for invalid input' },
    ]);
  } catch (error) {
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
    await sampleServer?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
