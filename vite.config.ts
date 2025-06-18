import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    electron({
      entry: 'electron/main.ts',
      onstart: (options) => {
        options.startup(); // 确保 dev server 启动后再启动 Electron
      }
    })
  ],
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true
  }
});
