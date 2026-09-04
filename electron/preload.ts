import { contextBridge, ipcRenderer } from 'electron';
import { NativeJsonFileBuffer } from './nativeJsonFileBuffer';

interface NativeJsonFileMetadata {
  path: string;
  name: string;
  size: number;
}

type NativeJsonFileStreamMessage =
  | ({ type: 'selected' } & NativeJsonFileMetadata)
  | { type: 'chunk'; chunk: Uint8Array }
  | { type: 'complete' }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

function openJsonFile(onSelected?: (metadata: NativeJsonFileMetadata) => void) {
  return new Promise<(NativeJsonFileMetadata & { content: string; contentBuffer: ArrayBuffer }) | null>(
    (resolve, reject) => {
      const channel = new MessageChannel();
      let fileBuffer: NativeJsonFileBuffer | null = null;
      let metadata: NativeJsonFileMetadata | null = null;

      const finish = () => {
        fileBuffer?.release();
        fileBuffer = null;
        channel.port1.close();
      };
      channel.port1.onmessage = (event: MessageEvent<NativeJsonFileStreamMessage>) => {
        const message = event.data;
        if (message.type === 'selected') {
          metadata = { name: message.name, path: message.path, size: message.size };
          fileBuffer = new NativeJsonFileBuffer(message.size);
          onSelected?.(metadata);
          // The preload isolated world does not reliably expose requestAnimationFrame
          // in packaged/E2E Electron builds. Yield one task instead so React can
          // commit the reading state before the main process starts streaming.
          setTimeout(() => {
            channel.port1.postMessage({ type: 'selected-ack' });
          }, 0);
          return;
        }

        if (message.type === 'chunk') {
          if (!fileBuffer) {
            finish();
            reject(new Error('JSON file metadata was not received before its content'));
            return;
          }

          fileBuffer.append(message.chunk);
          channel.port1.postMessage({ type: 'chunk-ack' });
          return;
        }

        if (message.type === 'cancelled') {
          finish();
          resolve(null);
          return;
        }

        if (message.type === 'error') {
          finish();
          reject(new Error(message.message));
          return;
        }

        if (!metadata || !fileBuffer) {
          finish();
          reject(new Error('JSON file metadata was not received'));
          return;
        }

        const { buffer: contentBuffer, text: content } = fileBuffer.finish();
        fileBuffer = null;
        channel.port1.close();
        resolve({ ...metadata, content, contentBuffer });
      };
      channel.port1.start();
      ipcRenderer.postMessage('file:openJsonStream', null, [channel.port2]);
    }
  );
}

contextBridge.exposeInMainWorld('electronAPI', {
  appendLog: (payload: string) => ipcRenderer.invoke('log:append', payload),
  readRecentLog: (maxBytes?: number) => ipcRenderer.invoke('log:readRecent', maxBytes),
  clearLog: () => ipcRenderer.invoke('log:clear'),
  showLogFile: () => ipcRenderer.invoke('log:showInFolder'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  getRuntimeInfo: () => ipcRenderer.invoke('app:runtimeInfo'),
  getProcessMetrics: () => ipcRenderer.invoke('app:processMetrics'),
  openJsonFile,
  onFindShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:find-shortcut', listener);
    return () => ipcRenderer.removeListener('app:find-shortcut', listener);
  },
});
