import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { evaluate } from './e2e-cdp-helpers.mjs';

const DEFAULT_SIZE_MB = 2;
const IMPORT_CHUNK_BYTES = 256 * 1024;

export function parseSizeMb() {
  const argIndex = process.argv.findIndex((arg) => arg === '--size-mb');
  const rawValue = argIndex >= 0 ? process.argv[argIndex + 1] : process.env.HANJSON_E2E_SIZE_MB;
  const value = Number(rawValue ?? DEFAULT_SIZE_MB);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SIZE_MB;
}

export function createSampleJson(targetBytes) {
  const records = [];
  let byteLength = 2;
  let index = 0;

  while (byteLength < targetBytes) {
    const record = JSON.stringify({
      id: index,
      name: `FxxkJson e2e sample ${index}`,
      active: index % 2 === 0,
      score: index % 1000,
      tags: ['electron', 'json', 'e2e', 'formatter'],
      message: 'x'.repeat(160),
      nested: {
        requestId: `req-e2e-${String(index).padStart(6, '0')}`,
        timestamp: '2026-05-18T00:00:00.000Z',
        values: [index, index + 1, index + 2],
      },
    });
    records.push(record);
    byteLength += Buffer.byteLength(record) + (records.length > 1 ? 1 : 0);
    index += 1;
  }

  return `[${records.join(',')}]`;
}

export async function importSampleByE2eBridge(cdp, samplePath) {
  const content = await readFile(samplePath, 'utf8');
  await evaluate(cdp, 'window.__HANJSON_E2E_SAMPLE_CHUNKS__ = []');

  for (let offset = 0; offset < content.length; offset += IMPORT_CHUNK_BYTES) {
    const chunk = content.slice(offset, offset + IMPORT_CHUNK_BYTES);
    await evaluate(cdp, `window.__HANJSON_E2E_SAMPLE_CHUNKS__.push(${JSON.stringify(chunk)})`);
  }

  await evaluate(
    cdp,
    `(async () => {
    const content = window.__HANJSON_E2E_SAMPLE_CHUNKS__.join('');
    delete window.__HANJSON_E2E_SAMPLE_CHUNKS__;
    await window.__HANJSON_E2E_APP__.importText(
      ${JSON.stringify(path.basename(samplePath))},
      ${Buffer.byteLength(content)},
      content
    );
    return true;
  })()`
  );
}
