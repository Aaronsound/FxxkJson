import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
const require = createRequire(import.meta.url);

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getElectronBinaryPath(electronPackageDir) {
  const pathFile = path.join(electronPackageDir, 'path.txt');

  try {
    const executablePath = (await fs.readFile(pathFile, 'utf8')).trim();
    if (!executablePath) {
      return null;
    }

    return path.join(electronPackageDir, 'dist', executablePath);
  } catch {
    return null;
  }
}

function runInstallScript(installScriptPath, electronMirror) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installScriptPath], {
      env: {
        ...process.env,
        ELECTRON_MIRROR: electronMirror,
        npm_config_electron_mirror: electronMirror,
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Electron install script exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  const electronPackageDir = path.dirname(require.resolve('electron/package.json'));
  const installScriptPath = require.resolve('electron/install.js');
  const existingBinaryPath = await getElectronBinaryPath(electronPackageDir);

  if (existingBinaryPath && await pathExists(existingBinaryPath)) {
    console.log(`[setup:electron] Electron binary found: ${existingBinaryPath}`);
    return;
  }

  const electronMirror = process.env.ELECTRON_MIRROR
    || process.env.npm_config_electron_mirror
    || DEFAULT_ELECTRON_MIRROR;

  console.log(`[setup:electron] Electron binary is missing. Downloading with mirror: ${electronMirror}`);
  await runInstallScript(installScriptPath, electronMirror);

  const installedBinaryPath = await getElectronBinaryPath(electronPackageDir);
  if (!installedBinaryPath || !await pathExists(installedBinaryPath)) {
    throw new Error('Electron install finished, but the executable was not found.');
  }

  console.log(`[setup:electron] Electron binary installed: ${installedBinaryPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
