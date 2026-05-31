import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { connectToElectronPage, evaluate, waitFor } from './e2e-cdp-helpers.mjs';

export async function getAvailablePort() {
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

export async function startElectronApp({ appMain, cwd, electronCli, port }) {
  let stderr = '';
  const shouldDisableSandbox = process.platform === 'linux' && (process.env.CI === 'true' || process.env.CI === '1');
  const electronArgs = [
    electronCli,
    ...(shouldDisableSandbox ? ['--no-sandbox'] : []),
    `--remote-debugging-port=${port}`,
    appMain,
  ];
  const child = spawn(process.execPath, electronArgs, {
    cwd,
    env: {
      ...process.env,
      ...(shouldDisableSandbox ? { ELECTRON_DISABLE_SANDBOX: '1' } : {}),
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

  return {
    child,
    getStderr: () => stderr,
  };
}

export async function connectAndPrepareElectronPage(port) {
  const cdp = await connectToElectronPage(port);
  await waitFor(
    () => evaluate(cdp, 'document.readyState === "complete" && Boolean(document.querySelector("input[type=file]"))'),
    'app shell'
  );
  await evaluate(cdp, 'window.__HANJSON_E2E__ = true');
  await evaluate(
    cdp,
    `(() => {
      const checkbox = Array.from(document.querySelectorAll('label.toolbar-checkbox'))
        .find((label) => label.textContent?.includes('大文件启用右侧定位'))
        ?.querySelector('input');
      if (checkbox && !checkbox.checked) {
        checkbox.click();
      }
      return Boolean(checkbox);
    })()`
  );
  await waitFor(() => evaluate(cdp, `Boolean(window.__HANJSON_E2E_APP__?.importText)`), 'E2E import bridge');
  return cdp;
}

export async function collectFailureArtifacts({ cdp, stderr }) {
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
    const diagnostics = await evaluate(
      cdp,
      `(() => JSON.stringify({
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
    }, null, 2))()`
    );
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
    await writeFile(path.join(artifactDir, 'renderer-screenshot.png'), Buffer.from(screenshot.data, 'base64'));
  } catch (screenshotError) {
    console.error(`Renderer screenshot failed: ${screenshotError.message}`);
  }
}
