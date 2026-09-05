import { contextBridge, ipcRenderer } from 'electron';
import { createNativeJsonFileImporter } from './nativeJsonFileImport';

const { openJsonFile, cancelJsonFileImport } = createNativeJsonFileImporter((port) => {
  ipcRenderer.postMessage('file:openJsonStream', null, [port]);
});

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
  cancelJsonFileImport,
  onFindShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:find-shortcut', listener);
    return () => ipcRenderer.removeListener('app:find-shortcut', listener);
  },
});
