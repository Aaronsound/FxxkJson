import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  appendLog: (payload: string) => ipcRenderer.invoke('log:append', payload),
  readRecentLog: (maxBytes?: number) => ipcRenderer.invoke('log:readRecent', maxBytes),
  clearLog: () => ipcRenderer.invoke('log:clear'),
  showLogFile: () => ipcRenderer.invoke('log:showInFolder'),
  openJsonFile: () => ipcRenderer.invoke('file:openJson'),
});
