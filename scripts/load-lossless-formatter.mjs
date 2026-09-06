import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Benchmark the production implementation, not a second formatting algorithm.
const source = await readFile(new URL('../src/utils/losslessJson.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
export const { layoutJsonTokens } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
