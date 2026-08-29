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

export async function startElectronApp({ appMain, cwd, electronCli, extraEnvironment = {}, port }) {
  let stderr = '';
  const isLinuxCi = process.platform === 'linux' && (process.env.CI === 'true' || process.env.CI === '1');
  const electronArgs = [
    electronCli,
    ...(isLinuxCi ? ['--no-sandbox', '--disable-gpu'] : []),
    `--remote-debugging-port=${port}`,
    appMain,
  ];
  const child = spawn(process.execPath, electronArgs, {
    cwd,
    env: {
      ...process.env,
      ...(isLinuxCi ? { ELECTRON_DISABLE_SANDBOX: '1' } : {}),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ELECTRON_OPEN_DEVTOOLS: '0',
      HANJSON_E2E_HIDDEN: '1',
      ...extraEnvironment,
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

export async function readElectronMemorySnapshot(cdp) {
  const processes = await evaluate(
    cdp,
    `window.electronAPI?.getProcessMetrics ? window.electronAPI.getProcessMetrics() : Promise.resolve([])`
  );
  const rendererHeapBytes = await evaluate(
    cdp,
    `typeof performance.memory?.usedJSHeapSize === 'number' ? performance.memory.usedJSHeapSize : 0`
  );
  const metrics = Array.isArray(processes) ? processes : [];
  const totalWorkingSetMb = metrics.reduce((total, metric) => total + (metric.memory?.workingSetSize ?? 0), 0) / 1024;
  const totalPeakWorkingSetMb =
    metrics.reduce((total, metric) => total + (metric.memory?.peakWorkingSetSize ?? 0), 0) / 1024;

  return {
    processCount: metrics.length,
    processes: metrics.map((metric) => ({
      name: metric.name,
      peakWorkingSetMb: (metric.memory?.peakWorkingSetSize ?? 0) / 1024,
      type: metric.type,
      workingSetMb: (metric.memory?.workingSetSize ?? 0) / 1024,
    })),
    rendererHeapMb: rendererHeapBytes / (1024 * 1024),
    totalPeakWorkingSetMb,
    totalWorkingSetMb,
  };
}

export function assertElectronMemoryBudget(snapshot, sizeMb, { peakSizeMb = sizeMb, workingSetSizeMb = sizeMb } = {}) {
  const totalWorkingSetBudgetMb = 700 + workingSetSizeMb * 20;
  const totalPeakWorkingSetBudgetMb = 950 + peakSizeMb * 24;
  const rendererHeapBudgetMb = 96 + sizeMb * 8;
  const failures = [];

  if (snapshot.processCount < 2) {
    failures.push(`process metrics unavailable (${snapshot.processCount} process records)`);
  }
  if (snapshot.totalWorkingSetMb > totalWorkingSetBudgetMb) {
    failures.push(
      `working set ${snapshot.totalWorkingSetMb.toFixed(1)} MB exceeds ${totalWorkingSetBudgetMb.toFixed(1)} MB`
    );
  }
  if (snapshot.totalPeakWorkingSetMb > totalPeakWorkingSetBudgetMb) {
    failures.push(
      `peak working set ${snapshot.totalPeakWorkingSetMb.toFixed(1)} MB exceeds ${totalPeakWorkingSetBudgetMb.toFixed(1)} MB`
    );
  }
  if (snapshot.rendererHeapMb > rendererHeapBudgetMb) {
    failures.push(
      `renderer heap ${snapshot.rendererHeapMb.toFixed(1)} MB exceeds ${rendererHeapBudgetMb.toFixed(1)} MB`
    );
  }

  if (failures.length > 0) {
    throw new Error(`Electron memory budget exceeded: ${failures.join('; ')}`);
  }
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
