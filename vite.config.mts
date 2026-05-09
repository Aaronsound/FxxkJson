import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

function getMonacoChunk(id: string) {
  const normalizedId = id.replace(/\\/g, '/');

  if (!normalizedId.includes('monaco-editor')) {
    return null;
  }

  if (normalizedId.includes('/vs/language/json/')) {
    return 'monaco-json';
  }

  if (normalizedId.includes('/vs/editor/contrib/')) {
    return 'monaco-editor-contrib';
  }

  if (normalizedId.includes('/vs/editor/browser/viewParts/')) {
    return 'monaco-editor-view-parts';
  }

  if (normalizedId.includes('/vs/editor/browser/widget/')) {
    return 'monaco-editor-widget';
  }

  if (normalizedId.includes('/vs/editor/browser/services/')) {
    return 'monaco-editor-browser-services';
  }

  if (normalizedId.includes('/vs/editor/browser/')) {
    return 'monaco-editor-browser';
  }

  if (normalizedId.includes('/vs/editor/common/model/')) {
    return 'monaco-editor-model';
  }

  if (normalizedId.includes('/vs/editor/common/viewModel/')) {
    return 'monaco-editor-view-model';
  }

  if (normalizedId.includes('/vs/editor/common/services/')) {
    return 'monaco-editor-services';
  }

  if (normalizedId.includes('/vs/editor/common/languages/')) {
    return 'monaco-editor-languages';
  }

  if (normalizedId.includes('/vs/editor/common/core/')) {
    return 'monaco-editor-core';
  }

  if (normalizedId.includes('/vs/editor/common/')) {
    return 'monaco-editor-common';
  }

  if (normalizedId.includes('/vs/platform/')) {
    return 'monaco-platform';
  }

  if (normalizedId.includes('/vs/base/browser/')) {
    return 'monaco-base-browser';
  }

  if (normalizedId.includes('/vs/base/common/')) {
    return 'monaco-base-common';
  }

  return 'monaco-core';
}

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
    rollupOptions: {
      output: {
        manualChunks(id) {
          const monacoChunk = getMonacoChunk(id);
          if (monacoChunk) {
            return monacoChunk;
          }

          if (id.includes('@monaco-editor')) {
            return 'monaco-react';
          }

          if (id.includes('react-dom') || id.includes('\\react\\') || id.includes('/react/')) {
            return 'react';
          }
        },
      },
    },
  }
});
