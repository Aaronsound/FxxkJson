import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './appWindow';
import { registerMainProcessIpc } from './ipcHandlers';
import { logRuntimeEvent } from './runtimeLog';
import { blockPackagedExternalRequests, hardenDefaultSession } from './security';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  hardenDefaultSession();
  blockPackagedExternalRequests();
  createWindow();
});

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
    reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason),
  });
});

registerMainProcessIpc({
  getMainWindow: () => mainWindow,
});
