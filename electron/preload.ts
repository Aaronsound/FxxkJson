import { contextBridge, ipcRenderer } from 'electron';

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

function openJsonFile() {
  return new Promise<(NativeJsonFileMetadata & { content: string }) | null>((resolve, reject) => {
    const channel = new MessageChannel();
    const decoder = new TextDecoder();
    const textChunks: string[] = [];
    let metadata: NativeJsonFileMetadata | null = null;

    const finish = () => channel.port1.close();
    channel.port1.onmessage = (event: MessageEvent<NativeJsonFileStreamMessage>) => {
      const message = event.data;
      if (message.type === 'selected') {
        metadata = { name: message.name, path: message.path, size: message.size };
        return;
      }

      if (message.type === 'chunk') {
        textChunks.push(decoder.decode(message.chunk, { stream: true }));
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

      if (!metadata) {
        finish();
        reject(new Error('JSON file metadata was not received'));
        return;
      }

      textChunks.push(decoder.decode());
      finish();
      resolve({ ...metadata, content: textChunks.join('') });
    };
    channel.port1.start();
    ipcRenderer.postMessage('file:openJsonStream', null, [channel.port2]);
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  appendLog: (payload: string) => ipcRenderer.invoke('log:append', payload),
  readRecentLog: (maxBytes?: number) => ipcRenderer.invoke('log:readRecent', maxBytes),
  clearLog: () => ipcRenderer.invoke('log:clear'),
  showLogFile: () => ipcRenderer.invoke('log:showInFolder'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  getRuntimeInfo: () => ipcRenderer.invoke('app:runtimeInfo'),
  openJsonFile,
  onFindShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:find-shortcut', listener);
    return () => ipcRenderer.removeListener('app:find-shortcut', listener);
  },
});
