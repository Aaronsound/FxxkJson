import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { jsonrepair } from 'jsonrepair';
import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';

const RIGHT_SEARCH_BATCH_SIZE = 2000;
const FALLBACK_RECORD_COUNT = RIGHT_SEARCH_BATCH_SIZE + 105;

function createFallbackSample() {
  return JSON.stringify(
    Array.from({ length: FALLBACK_RECORD_COUNT }, (_, index) => ({
      id: index,
      name: `FxxkJson smoke sample ${index}`,
      active: index % 2 === 0,
      nested: {
        requestId: `req-smoke-${String(index).padStart(4, '0')}`,
        values: [index, index + 1, index + 2],
      },
    }))
  );
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

function findLiteralSearchBatch(text, query, startOffset = 0, maxResults = RIGHT_SEARCH_BATCH_SIZE) {
  const matches = [];
  let offset = Math.max(0, startOffset);

  while (offset < text.length) {
    const next = text.indexOf(query, offset);
    if (next === -1) {
      return {
        hasMore: false,
        matches,
        nextStartOffset: offset,
      };
    }

    if (matches.length >= maxResults) {
      return {
        hasMore: true,
        matches,
        nextStartOffset: next,
      };
    }

    matches.push(next);
    offset = next + query.length;
  }

  return {
    hasMore: false,
    matches,
    nextStartOffset: offset,
  };
}

function editFirstRecord(text) {
  const json = JSON.parse(text);
  const firstRecord = Array.isArray(json) ? json[0] : json;

  if (!firstRecord || typeof firstRecord !== 'object') {
    throw new Error('Smoke sample must be an object or an array of objects');
  }

  firstRecord.__fxxkjsonSmoke = 'updated';
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

  return formatted.includes('requestId') ? 'requestId' : findFirstObjectKey(parsed);
}

function readNodeLiteralAtOffset(formatted, offset) {
  const tree = parseTree(formatted);
  if (!tree) {
    throw new Error('Smoke node action could not parse formatted JSON');
  }

  const location = getLocation(formatted, offset);
  const node = findNodeAtLocation(tree, location.path);
  if (!node) {
    throw new Error('Smoke node action could not resolve a JSON node');
  }

  return {
    literal: formatted.slice(node.offset, node.offset + node.length),
    path: location.path,
    start: node.offset,
    end: node.offset + node.length,
  };
}

function smokeRightPaneNodeActions(formatted) {
  const valueOffset = formatted.indexOf('"req-');
  if (valueOffset === -1) {
    throw new Error('Smoke node action did not find a requestId value');
  }

  const node = readNodeLiteralAtOffset(formatted, valueOffset);
  if (!node.path.includes('requestId')) {
    throw new Error(`Smoke node action resolved an unexpected path: ${node.path.join('.')}`);
  }

  const copiedValue = JSON.parse(node.literal);
  if (typeof copiedValue !== 'string' || !copiedValue.startsWith('req-')) {
    throw new Error('Smoke node action copied an unexpected value');
  }

  const editedLiteral = JSON.stringify('req-smoke-updated');
  const patched = `${formatted.slice(0, node.start)}${editedLiteral}${formatted.slice(node.end)}`;
  if (!JSON.parse(patched)) {
    throw new Error('Smoke node edit patch produced invalid JSON');
  }

  return {
    copiedValue,
    path: node.path.join('.'),
  };
}

async function main() {
  const filePath = process.argv[2];
  const input = await readInput(filePath);
  const formatted = formatJson(input.text);
  const searchQuery = getSmokeSearchQuery(formatted);
  const requestMatches = searchQuery ? countSearchMatches(formatted, searchQuery) : 0;
  const firstSearchBatch = searchQuery
    ? findLiteralSearchBatch(formatted, searchQuery, 0, RIGHT_SEARCH_BATCH_SIZE)
    : { hasMore: false, matches: [], nextStartOffset: 0 };
  const secondSearchBatch =
    searchQuery && firstSearchBatch.hasMore
      ? findLiteralSearchBatch(formatted, searchQuery, firstSearchBatch.nextStartOffset, RIGHT_SEARCH_BATCH_SIZE)
      : { hasMore: false, matches: [], nextStartOffset: firstSearchBatch.nextStartOffset };
  const rightNodeAction = smokeRightPaneNodeActions(formatted);
  const edited = editFirstRecord(formatted);
  const repaired = jsonrepair('{ok: true, trailing: [1,2,],}');
  const repairedFormatted = formatJson(repaired);

  if (!formatted.trim().startsWith('[') && !formatted.trim().startsWith('{')) {
    throw new Error('Formatted output does not look like JSON');
  }

  if (requestMatches < 1) {
    throw new Error(`Search smoke did not find ${searchQuery ?? 'a searchable object key'}`);
  }

  if (requestMatches > RIGHT_SEARCH_BATCH_SIZE && (!firstSearchBatch.hasMore || secondSearchBatch.matches.length < 1)) {
    throw new Error('Right search smoke did not load additional matches');
  }

  if (!edited.includes('__fxxkjsonSmoke')) {
    throw new Error('Edit smoke did not update the JSON payload');
  }

  if (!repairedFormatted.includes('"ok": true')) {
    throw new Error('Repair smoke did not produce valid formatted JSON');
  }

  console.log('FxxkJson smoke flow passed');
  console.table([
    { step: 'input', detail: input.label },
    { step: 'format', detail: `${formatted.length.toLocaleString()} chars` },
    { step: `search ${searchQuery}`, detail: `${requestMatches.toLocaleString()} matches` },
    {
      step: 'right search batch',
      detail: firstSearchBatch.hasMore
        ? `${firstSearchBatch.matches.length.toLocaleString()} + ${secondSearchBatch.matches.length.toLocaleString()} loaded`
        : `${firstSearchBatch.matches.length.toLocaleString()} loaded`,
    },
    { step: 'right node action', detail: `${rightNodeAction.path} copied ${rightNodeAction.copiedValue}` },
    { step: 'edit', detail: '__fxxkjsonSmoke updated' },
    { step: 'repair', detail: 'malformed JSON repaired and formatted' },
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
