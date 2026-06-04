import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

describe('jsonWorkerTextPayload imports', () => {
  it('uses an explicit TypeScript extension from JavaScript worker modules', () => {
    for (const filePath of [
      'src/workers/jsonWorkerFormatOperations.js',
      'src/workers/jsonWorkerStructureOperations.js',
    ]) {
      const source = readFileSync(join(process.cwd(), filePath), 'utf8');

      expect(source).toContain("./jsonWorkerTextPayload.ts'");
      expect(source).not.toContain("./jsonWorkerTextPayload'");
    }
  });
});
