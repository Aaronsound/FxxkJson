import { BrowserWindow } from 'electron';
import * as path from 'path';
import { logRuntimeEvent } from './runtimeLog';
import { guardMainWindowContents } from './security';

export function createMainWindow() {
  const shouldOpenDevTools = process.env.ELECTRON_OPEN_DEVTOOLS !== '0';
  const mainWindow = new BrowserWindow({
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

  guardMainWindowContents(mainWindow.webContents);

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
    mainWindow.show();
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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isPrimaryFindShortcut = (input.control || input.meta) && !input.alt;
    const isAltFindShortcut = input.alt && !input.control && !input.meta;
    const isFindShortcut =
      input.type === 'keyDown' &&
      input.key?.toLowerCase() === 'f' &&
      !input.shift &&
      (isPrimaryFindShortcut || isAltFindShortcut);

    if (!isFindShortcut) {
      return;
    }

    event.preventDefault();
    mainWindow.webContents.send('app:find-shortcut');
  });

  return mainWindow;
}
