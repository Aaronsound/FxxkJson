import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Benchmark the production implementation, not a second formatting algorithm.
const source = await readFile(new URL('../src/utils/losslessJson.ts', import.meta.url), 'utf8');
// Keep the compiler and its heap out of the measured process: retaining it changes
// GC pressure for later tree benchmarks even though the app ships compiled JS.
const outputText = execFileSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `
  import ts from ${JSON.stringify(import.meta.resolve('typescript'))};
  import { readFileSync } from 'node:fs';
  const { outputText } = ts.transpileModule(readFileSync(0, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  process.stdout.write(outputText);
`,
  ],
  {
    input: source,
    encoding: 'utf8',
  }
);
export const { layoutJsonTokens } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
