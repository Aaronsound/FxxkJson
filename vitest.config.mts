import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vitest/config';

const monacoMarkedPath = '/node_modules/monaco-editor/esm/vs/base/common/marked/marked.js';
const monacoMissingSourceMapComment = /\n\/\/# sourceMappingURL=marked\.umd\.js\.map\s*$/;

export default defineConfig({
  plugins: [
    {
      name: 'strip-monaco-marked-missing-source-map',
      async load(id) {
        const filePath = id.split('?')[0];
        if (!filePath.endsWith(monacoMarkedPath)) {
          return null;
        }

        const source = await readFile(filePath, 'utf8');
        return source.replace(monacoMissingSourceMapComment, '\n');
      },
    },
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/types/**',
        'src/index.tsx',
        'src/setup/**',
        'src/hooks/useE2eTestBridge.ts',
      ],
      thresholds: {
        // These global values cover every renderer source file above, including
        // orchestration modules that are exercised primarily through Electron E2E.
        branches: 62,
        functions: 65,
        lines: 67,
        statements: 67,
        'src/components/**': {
          branches: 63,
          functions: 67,
          lines: 72,
          statements: 72,
        },
        'src/utils/**': {
          branches: 80,
          functions: 94,
          lines: 87,
          statements: 87,
        },
        'src/workers/**': {
          branches: 64,
          functions: 87,
          lines: 72,
          statements: 72,
        },
        'src/hooks/useJsonToolContentActions.ts': {
          branches: 90,
          functions: 100,
          lines: 97,
          statements: 97,
        },
        'src/workers/jsonWorkerEditJsonOperations.ts': {
          branches: 83,
          functions: 100,
          lines: 95,
          statements: 95,
        },
      },
    },
  },
});
