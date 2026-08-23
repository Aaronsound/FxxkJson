import { performance } from 'node:perf_hooks';
import { findNodeAtLocation, getLocation } from 'jsonc-parser';

export const RIGHT_SEARCH_BATCH_SIZE = 2000;

export function formatDuration(value) {
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

export function formatBytes(value) {
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[index]}`;
}

export function measure(label, fn) {
  const start = performance.now();
  const value = fn();
  const end = performance.now();

  return {
    label,
    value,
    ms: end - start,
  };
}

export function buildViewerDataStats(text) {
  const lineStarts = [0];
  const regionStartLines = [];
  const regionEndLines = [];
  const regionParentIndexes = [];
  const regionKinds = [];
  const stackClose = [];
  const stackRegionIndex = [];
  let line = 1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '\n') {
      line += 1;
      lineStarts.push(index + 1);
      continue;
    }

    if (char === '{' || char === '[') {
      stackClose.push(char === '{' ? '}' : ']');
      stackRegionIndex.push(regionStartLines.length);
      regionStartLines.push(line);
      regionEndLines.push(line);
      regionParentIndexes.push(stackRegionIndex.at(-2) ?? -1);
      regionKinds.push(char === '[' ? 1 : 0);
      continue;
    }

    if (char === '}' || char === ']') {
      const expectedClose = stackClose.pop();
      const regionIndex = stackRegionIndex.pop();
      if (expectedClose !== char || typeof regionIndex !== 'number') {
        continue;
      }

      regionEndLines[regionIndex] = line;
    }
  }

  const originalToCompactIndex = new Int32Array(regionStartLines.length);
  originalToCompactIndex.fill(-1);
  let regionCount = 0;
  for (let index = 0; index < regionStartLines.length; index += 1) {
    if (regionStartLines[index] < regionEndLines[index]) {
      originalToCompactIndex[index] = regionCount;
      regionCount += 1;
    }
  }

  const compactStartLines = new Uint32Array(regionCount);
  const compactEndLines = new Uint32Array(regionCount);
  const compactParentIndexes = new Int32Array(regionCount);
  const compactKinds = new Uint8Array(regionCount);
  let compactIndex = 0;

  for (let index = 0; index < regionStartLines.length; index += 1) {
    if (originalToCompactIndex[index] < 0) {
      continue;
    }

    let parentIndex = regionParentIndexes[index];
    while (parentIndex >= 0 && originalToCompactIndex[parentIndex] < 0) {
      parentIndex = regionParentIndexes[parentIndex];
    }

    compactStartLines[compactIndex] = regionStartLines[index];
    compactEndLines[compactIndex] = regionEndLines[index];
    compactParentIndexes[compactIndex] = parentIndex >= 0 ? originalToCompactIndex[parentIndex] : -1;
    compactKinds[compactIndex] = regionKinds[index];
    compactIndex += 1;
  }

  const compactLineStarts = Uint32Array.from(lineStarts);
  const regionIndexBytes =
    compactStartLines.byteLength +
    compactEndLines.byteLength +
    compactParentIndexes.byteLength +
    compactKinds.byteLength;

  return {
    indexBytes: compactLineStarts.byteLength + regionIndexBytes,
    lineCount: compactLineStarts.length,
    regionCount,
    regionIndexBytes,
  };
}

export function findLiteralSearchBatch(text, query, startOffset = 0, maxResults = RIGHT_SEARCH_BATCH_SIZE) {
  let count = 0;
  let offset = Math.max(0, startOffset);

  while (offset < text.length) {
    const next = text.indexOf(query, offset);
    if (next === -1) {
      return {
        count,
        hasMore: false,
        nextStartOffset: offset,
      };
    }

    if (count >= maxResults) {
      return {
        count,
        hasMore: true,
        nextStartOffset: next,
      };
    }

    count += 1;
    offset = next + query.length;
  }

  return {
    count,
    hasMore: false,
    nextStartOffset: offset,
  };
}

export function replaceLiteralMatches(text, query, replacement) {
  return text.split(query).join(replacement);
}

export function replaceRegexMatches(text, query, replacement) {
  return text.replace(new RegExp(query, 'g'), replacement);
}

export function getRightSearchQuery(formattedText) {
  return formattedText.includes('requestId') ? 'requestId' : '"id"';
}

export function readFirstRequestValue(formattedText, formattedTree) {
  const offset = formattedText.indexOf('"req-');
  if (offset === -1 || !formattedTree) {
    return null;
  }

  const location = getLocation(formattedText, offset);
  const node = findNodeAtLocation(formattedTree, location.path);
  if (!node) {
    return null;
  }

  return {
    end: node.offset + node.length,
    literal: formattedText.slice(node.offset, node.offset + node.length),
    path: location.path,
    start: node.offset,
  };
}
