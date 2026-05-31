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
      thresholds: {
        branches: 63,
        functions: 78,
        lines: 74,
        statements: 74,
      },
    },
  },
});
