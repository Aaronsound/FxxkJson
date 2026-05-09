import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

let mainWindow: BrowserWindow | null = null;
const logDir = path.join(app.getPath('userData'), 'logs');
const logFilePath = path.join(logDir, 'runtime.log');

async function appendRuntimeLog(entry: string) {
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logFilePath, `[${new Date().toISOString()}] ${entry}\n`, 'utf8');
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
