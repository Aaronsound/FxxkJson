import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  appendLog: (payload: string) => ipcRenderer.invoke('log:append', payload),
  readRecentLog: (maxBytes?: number) => ipcRenderer.invoke('log:readRecent', maxBytes),
  clearLog: () => ipcRenderer.invoke('log:clear'),
  showLogFile: () => ipcRenderer.invoke('log:showInFolder'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  openJsonFile: () => ipcRenderer.invoke('file:openJson'),
  onFindShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:find-shortcut', listener);
    return () => ipcRenderer.removeListener('app:find-shortcut', listener);
  },
});
