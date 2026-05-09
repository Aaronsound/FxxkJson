import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart: ({ startup }) => {
          startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', ...builtinModules],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', ...builtinModules],
            },
          },
        },
      },
    ])
  ],
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    // Monaco is a first-screen dependency for this tool; keep it in one safe
    // package chunk and set the warning limit to the measured production size.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
            return 'monaco';
          }

          if (id.includes('react-dom') || id.includes('\\react\\') || id.includes('/react/')) {
            return 'react';
          }
        },
      },
    },
  }
});
