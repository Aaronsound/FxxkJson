import { spawn } from 'node:child_process';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { connectAndPrepareElectronPage, getAvailablePort } from './e2e-electron-app.mjs';

async function findPackagedExecutable(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findPackagedExecutable(candidate);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (process.platform === 'darwin' && candidate.endsWith('.app/Contents/MacOS/FxxkJson')) {
      return candidate;
    }
    if (
      process.platform === 'win32' &&
      entry.name.toLowerCase() === 'fxxkjson.exe' &&
      candidate.toLowerCase().includes('win-unpacked')
    ) {
      return candidate;
    }
  }
  return null;
}

async function resolvePackagedExecutable() {
  const releaseRoot = path.resolve('release');
  const preferred =
    process.platform === 'darwin'
      ? path.join(
          releaseRoot,
          process.arch === 'arm64' ? 'mac-arm64' : 'mac',
          'FxxkJson.app',
          'Contents',
          'MacOS',
          'FxxkJson'
        )
      : path.join(releaseRoot, 'win-unpacked', 'FxxkJson.exe');
  try {
    await access(preferred);
    return preferred;
  } catch {
    return findPackagedExecutable(releaseRoot);
  }
}

async function main() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    console.log(`Packaged app smoke skipped on ${process.platform}`);
    return;
  }

  const executable = await resolvePackagedExecutable();
  if (!executable) {
    throw new Error(`Could not find a packaged FxxkJson executable for ${process.platform}`);
  }

  const port = await getAvailablePort();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-packaged-smoke-'));
  let stderr = '';
  const child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ELECTRON_OPEN_DEVTOOLS: '0',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  let cdp = null;
  try {
    cdp = await connectAndPrepareElectronPage(port);
    console.log(`Packaged ${process.platform} app launch smoke passed: ${executable}`);
  } catch (error) {
    if (stderr) {
      console.error(stderr);
    }
    throw error;
  } finally {
    cdp?.close();
    if (!child.killed) {
      await new Promise((resolve) => {
        const timeoutId = setTimeout(resolve, 5000);
        child.once('exit', () => {
          clearTimeout(timeoutId);
          resolve();
        });
        child.kill();
      });
    }
    await rm(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
