import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // 无论开发还是打包，都从 __dirname 目录加载 preload.js
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    // 开发模式：Vite 默认端口
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
      // mainWindow.webContents.openDevTools({ mode: 'detach' });

  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// —— IPC 保留你的逻辑：文件选择与读取 —— //
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    filters: [
      { name: 'JSON', extensions: ['json', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('file:readJson', async (_ev, filePath: string) => {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (e: any) {
    throw new Error('读取文件失败：' + e.message);
  }
});
