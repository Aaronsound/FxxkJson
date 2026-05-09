import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

let mainWindow: BrowserWindow | null = null;
const logDir = path.join(app.getPath('userData'), 'logs');
const logFilePath = path.join(logDir, 'runtime.log');

async function appendRuntimeLog(entry: string) {
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logFilePath, `[${new Date().toISOString()}] ${entry}\n`, 'utf8');
}

async function readRecentRuntimeLog(maxBytes = 160 * 1024) {
  await fs.mkdir(logDir, { recursive: true });

  try {
    const stats = await fs.stat(logFilePath);
    const byteLength = Math.max(0, Math.min(stats.size, Math.floor(maxBytes)));
    const start = Math.max(0, stats.size - byteLength);
    const file = await fs.open(logFilePath, 'r');

    try {
      const buffer = Buffer.alloc(byteLength);
      await file.read(buffer, 0, byteLength, start);
      return {
        path: logFilePath,
        content: buffer.toString('utf8'),
        truncated: start > 0,
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        path: logFilePath,
        content: '',
        truncated: false,
      };
    }

    throw error;
  }
}

function logRuntimeEvent(event: string, details: object = {}) {
  appendRuntimeLog(JSON.stringify({
    event,
    ...details,
  })).catch(() => {
    // Ignore logging failures in the main process.
  });
}

function createWindow() {
  const shouldOpenDevTools = process.env.ELECTRON_OPEN_DEVTOOLS !== '0';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    if (shouldOpenDevTools) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('console-message', (details) => {
    if (details.level === 'info' || details.level === 'debug') {
      return;
    }

    logRuntimeEvent('renderer-console', {
      level: details.level,
      message: details.message,
      line: details.lineNumber,
      sourceId: details.sourceId,
    });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logRuntimeEvent('render-process-gone', details);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logRuntimeEvent('did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  logRuntimeEvent('main-uncaught-exception', {
    message: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  logRuntimeEvent('main-unhandled-rejection', {
    reason: reason instanceof Error
      ? { message: reason.message, stack: reason.stack }
      : String(reason),
  });
});

ipcMain.handle('log:append', async (_event, payload: string) => {
  await appendRuntimeLog(payload);
  return logFilePath;
});

ipcMain.handle('log:readRecent', async (_event, maxBytes?: number) => (
  readRecentRuntimeLog(maxBytes)
));

ipcMain.handle('log:showInFolder', async () => {
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logFilePath, '', 'utf8');
  shell.showItemInFolder(logFilePath);
  return logFilePath;
});

ipcMain.handle('file:openJson', async () => {
  const dialogOptions: OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      { name: 'JSON / Text', extensions: ['json', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const stats = await fs.stat(filePath);
  const content = await fs.readFile(filePath, 'utf8');

  logRuntimeEvent('native-file-opened', {
    fileName: path.basename(filePath),
    fileSize: stats.size,
  });

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    content,
  };
});
