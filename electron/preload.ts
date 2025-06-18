import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectJsonFile: () => ipcRenderer.invoke('dialog:openFile'),
  readJsonFile: (filePath: string) => ipcRenderer.invoke('file:readJson', filePath)
});