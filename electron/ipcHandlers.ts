import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, MessagePortMain, OpenDialogOptions } from 'electron';
import { app, clipboard, dialog, ipcMain, shell } from 'electron';
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
const JSON_FILE_STREAM_CHUNK_SIZE = 1024 * 1024;

interface MainProcessIpcOptions {
  getMainWindow: () => BrowserWindow | null;
}

export function registerMainProcessIpc({ getMainWindow }: MainProcessIpcOptions) {
  const isTrustedMainWindowSender = (event: IpcMainEvent | IpcMainInvokeEvent) => {
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

  handleTrustedIpc('app:processMetrics', async () =>
    app.getAppMetrics().map((metric) => ({
      memory: {
        peakWorkingSetSize: metric.memory.peakWorkingSetSize,
        workingSetSize: metric.memory.workingSetSize,
      },
      name: metric.name ?? null,
      pid: metric.pid,
      type: metric.type,
    }))
  );

  ipcMain.on('file:openJsonStream', (event) => {
    const port = event.ports[0];
    if (!port) {
      logRuntimeEvent('missing-json-file-stream-port');
      return;
    }

    if (!isTrustedMainWindowSender(event)) {
      logRuntimeEvent('blocked-ipc-sender', { channel: 'file:openJsonStream' });
      port.close();
      return;
    }

    void streamSelectedJsonFile(getMainWindow(), port);
  });
}

async function streamSelectedJsonFile(mainWindow: BrowserWindow | null, port: MessagePortMain) {
  const dialogOptions: OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      { name: 'JSON / Text', extensions: ['json', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  };

  try {
    port.start();
    const filePath = await selectJsonFilePath(mainWindow, dialogOptions);
    if (!filePath) {
      port.postMessage({ type: 'cancelled' });
      port.close();
      return;
    }

    const stats = await fs.stat(filePath);
    const fileName = path.basename(filePath);
    const selectionAcknowledged = waitForJsonStreamAcknowledgement(
      port,
      'selected-ack',
      'JSON file stream was closed before the selection was acknowledged'
    );
    port.postMessage({ type: 'selected', path: filePath, name: fileName, size: stats.size });
    await selectionAcknowledged;

    const stream = createReadStream(filePath, { highWaterMark: JSON_FILE_STREAM_CHUNK_SIZE });
    const closeStream = () => stream.destroy();
    port.once('close', closeStream);

    for await (const chunk of stream) {
      const chunkAcknowledged = waitForJsonStreamAcknowledgement(
        port,
        'chunk-ack',
        'JSON file stream was closed before the chunk was acknowledged'
      );
      port.postMessage({ type: 'chunk', chunk });
      await chunkAcknowledged;
    }

    port.removeListener('close', closeStream);
    port.postMessage({ type: 'complete' });
    port.close();

    logRuntimeEvent('native-file-opened', {
      fileName,
      fileSize: stats.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    port.postMessage({ type: 'error', message });
    port.close();
    logRuntimeEvent('native-file-open-failed', { message });
  }
}

async function selectJsonFilePath(mainWindow: BrowserWindow | null, dialogOptions: OpenDialogOptions) {
  const e2eFilePath =
    !app.isPackaged && process.env.HANJSON_E2E_NATIVE_IMPORT === '1'
      ? process.env.HANJSON_E2E_NATIVE_IMPORT_PATH
      : undefined;
  if (e2eFilePath) {
    return path.resolve(e2eFilePath);
  }

  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

function waitForJsonStreamAcknowledgement(port: MessagePortMain, type: string, closeError: string) {
  return new Promise<void>((resolve, reject) => {
    const handleMessage = (event: Electron.MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type !== type) {
        return;
      }

      cleanup();
      resolve();
    };
    const handleClose = () => {
      cleanup();
      reject(new Error(closeError));
    };
    const cleanup = () => {
      port.removeListener('message', handleMessage);
      port.removeListener('close', handleClose);
    };

    port.on('message', handleMessage);
    port.once('close', handleClose);
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
