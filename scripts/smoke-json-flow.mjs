import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { jsonrepair } from 'jsonrepair';

function createFallbackSample() {
  return JSON.stringify([
    {
      id: 0,
      name: 'HanJson smoke sample',
      active: true,
      nested: {
        requestId: 'req-smoke-0001',
        values: [0, 1, 2],
      },
    },
  ]);
}

async function readInput(filePath) {
  if (!filePath) {
    return {
      label: 'inline smoke fixture',
      text: createFallbackSample(),
    };
  }

  const resolvedPath = path.resolve(filePath);

  return {
    label: resolvedPath,
    text: await fs.readFile(resolvedPath, 'utf8'),
  };
}

function formatJson(text) {
  return JSON.stringify(JSON.parse(text), null, 2);
}

function countSearchMatches(text, query) {
  let count = 0;
  let offset = 0;

  while (offset < text.length) {
    const next = text.indexOf(query, offset);
    if (next === -1) {
      break;
    }

    count += 1;
    offset = next + query.length;
  }

  return count;
}

function editFirstRecord(text) {
  const json = JSON.parse(text);
  const firstRecord = Array.isArray(json) ? json[0] : json;

  if (!firstRecord || typeof firstRecord !== 'object') {
    throw new Error('Smoke sample must be an object or an array of objects');
  }

  firstRecord.__hanjsonSmoke = 'updated';
  return JSON.stringify(json, null, 2);
}

function findFirstObjectKey(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const key = findFirstObjectKey(item);
      if (key) {
        return key;
      }
    }
    return null;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)[0] ?? null;
  }

  return null;
}

function getSmokeSearchQuery(formatted) {
  const parsed = JSON.parse(formatted);

  return formatted.includes('requestId')
    ? 'requestId'
    : findFirstObjectKey(parsed);
}

async function main() {
  const filePath = process.argv[2];
  const input = await readInput(filePath);
  const formatted = formatJson(input.text);
  const searchQuery = getSmokeSearchQuery(formatted);
  const requestMatches = searchQuery ? countSearchMatches(formatted, searchQuery) : 0;
  const edited = editFirstRecord(formatted);
  const repaired = jsonrepair('{ok: true, trailing: [1,2,],}');
  const repairedFormatted = formatJson(repaired);

  if (!formatted.trim().startsWith('[') && !formatted.trim().startsWith('{')) {
    throw new Error('Formatted output does not look like JSON');
  }

  if (requestMatches < 1) {
    throw new Error(`Search smoke did not find ${searchQuery ?? 'a searchable object key'}`);
  }

  if (!edited.includes('__hanjsonSmoke')) {
    throw new Error('Edit smoke did not update the JSON payload');
  }

  if (!repairedFormatted.includes('"ok": true')) {
    throw new Error('Repair smoke did not produce valid formatted JSON');
  }

  console.log('HanJson smoke flow passed');
  console.table([
    { step: 'input', detail: input.label },
    { step: 'format', detail: `${formatted.length.toLocaleString()} chars` },
    { step: `search ${searchQuery}`, detail: `${requestMatches.toLocaleString()} matches` },
    { step: 'edit', detail: '__hanjsonSmoke updated' },
    { step: 'repair', detail: 'malformed JSON repaired and formatted' },
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
