import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

describe('jsonWorkerTextPayload imports', () => {
  it('uses explicit TypeScript extensions from JavaScript worker modules', () => {
    const workerSource = readFileSync(join(process.cwd(), 'src/workers/jsonParser.worker.js'), 'utf8');

    expect(workerSource).toContain("./jsonWorkerFormatOperations.ts'");
    expect(workerSource).toContain("./jsonWorkerLocateOperations.ts'");
    expect(workerSource).toContain("./jsonWorkerSearchOperations.ts'");
    expect(workerSource).toContain("./jsonWorkerStructureOperations.ts'");
    expect(workerSource).not.toContain("./jsonWorkerFormatOperations'");
  });
});
