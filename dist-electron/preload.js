"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    selectJsonFile: () => electron_1.ipcRenderer.invoke('dialog:openFile'),
    readJsonFile: (filePath) => electron_1.ipcRenderer.invoke('file:readJson', filePath)
});
