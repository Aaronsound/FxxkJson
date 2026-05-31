import { app, clipboard, dialog, ipcMain, shell } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent, OpenDialogOptions } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isRunningUnderRosetta } from './rosetta';
import {
  appendRuntimeLog,
  getLogReadLimit,
  logDir,
  logFilePath,
  logRuntimeEvent,
  readRecentRuntimeLog,
} from './runtimeLog';

const MAX_LOG_APPEND_LENGTH = 64 * 1024;

interface MainProcessIpcOptions {
  getMainWindow: () => BrowserWindow | null;
}

export function registerMainProcessIpc({ getMainWindow }: MainProcessIpcOptions) {
  const isTrustedMainWindowSender = (event: IpcMainInvokeEvent) => {
    const mainWindow = getMainWindow();
    return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
  };

  const handleTrustedIpc = <Args extends unknown[], Result>(
    channel: string,
    handler: (...args: Args) => Promise<Result> | Result
  ) => {
    ipcMain.handle(channel, async (event, ...args: Args) => {
      if (!isTrustedMainWindowSender(event)) {
        logRuntimeEvent('blocked-ipc-sender', { channel });
        throw new Error(`Blocked IPC sender for ${channel}`);
      }

      return handler(...args);
    });
  };

  handleTrustedIpc('log:append', async (payload: unknown) => {
    await appendRuntimeLog(getLogAppendPayload(payload));
    return logFilePath;
  });

  handleTrustedIpc('log:readRecent', async (maxBytes?: unknown) => readRecentRuntimeLog(getLogReadLimit(maxBytes)));

  handleTrustedIpc('log:clear', async () => {
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(logFilePath, '', 'utf8');
    return logFilePath;
  });

  handleTrustedIpc('log:showInFolder', async () => {
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFilePath, '', 'utf8');
    shell.showItemInFolder(logFilePath);
    return logFilePath;
  });

  handleTrustedIpc('clipboard:writeText', async (text: unknown) => {
    clipboard.writeText(getClipboardText(text));
    return true;
  });

  handleTrustedIpc('clipboard:readText', async () => clipboard.readText());

  handleTrustedIpc('app:runtimeInfo', async () => ({
    arch: process.arch,
    isMacTranslated: await isRunningUnderRosetta(),
    isPackaged: app.isPackaged,
    platform: process.platform,
  }));

  handleTrustedIpc('file:openJson', async () => {
    const dialogOptions: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: 'JSON / Text', extensions: ['json', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const mainWindow = getMainWindow();
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
}

function getLogAppendPayload(payload: unknown) {
  if (typeof payload !== 'string') {
    throw new TypeError('Log payload must be text');
  }

  return payload.slice(0, MAX_LOG_APPEND_LENGTH);
}

function getClipboardText(text: unknown) {
  if (typeof text !== 'string') {
    throw new TypeError('Clipboard payload must be text');
  }

  return text;
}
