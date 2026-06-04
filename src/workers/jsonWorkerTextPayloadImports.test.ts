import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

describe('jsonWorkerTextPayload imports', () => {
  it('uses explicit TypeScript extensions from JavaScript worker modules', () => {
    const structureSource = readFileSync(join(process.cwd(), 'src/workers/jsonWorkerStructureOperations.js'), 'utf8');
    const workerSource = readFileSync(join(process.cwd(), 'src/workers/jsonParser.worker.js'), 'utf8');

    expect(structureSource).toContain("./jsonWorkerTextPayload.ts'");
    expect(structureSource).not.toContain("./jsonWorkerTextPayload'");
    expect(workerSource).toContain("./jsonWorkerFormatOperations.ts'");
    expect(workerSource).not.toContain("./jsonWorkerFormatOperations'");
  });
});
