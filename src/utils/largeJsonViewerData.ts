import { DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD } from '../types/jsonTool';
import type {
  JsonSearchOptions,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeJsonViewerRegion,
  LargeJsonViewerRegions,
} from '../types/jsonTool';
import { findTextSearchBatch, findTextSearchMatches } from './searchText';
import type { TextSearchBatch } from './searchText';

export function buildLargeViewerData(
  text: string,
  lineThreshold = DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD
): LargeJsonViewerData | null {
  const lineStarts = [0];
  const regionStartLines: number[] = [];
  const regionEndLines: number[] = [];
  const regionParentIndexes: number[] = [];
  const regionKinds: number[] = [];
  const stackClose: Array<'}' | ']'> = [];
  const stackRegionIndex: number[] = [];
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

    if (char === '{') {
      stackClose.push('}');
      stackRegionIndex.push(regionStartLines.length);
      regionStartLines.push(line);
      regionEndLines.push(line);
      regionParentIndexes.push(stackRegionIndex.at(-2) ?? -1);
      regionKinds.push(0);
      continue;
    }

    if (char === '[') {
      stackClose.push(']');
      stackRegionIndex.push(regionStartLines.length);
      regionStartLines.push(line);
      regionEndLines.push(line);
      regionParentIndexes.push(stackRegionIndex.at(-2) ?? -1);
      regionKinds.push(1);
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

  if (lineStarts.length <= lineThreshold) {
    return null;
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

  return {
    lineStarts: Uint32Array.from(lineStarts),
    regions: {
      startLines: compactStartLines,
      endLines: compactEndLines,
      parentIndexes: compactParentIndexes,
      kinds: compactKinds,
    },
    lineCount: lineStarts.length,
  };
}

export function getLargeJsonViewerRegion(regions: LargeJsonViewerRegions, index: number): LargeJsonViewerRegion | null {
  if (index < 0 || index >= regions.startLines.length) {
    return null;
  }

  return {
    startLine: regions.startLines[index],
    endLine: regions.endLines[index],
    kind: regions.kinds[index] === 1 ? 'array' : 'object',
  };
}

export function findFirstRegionIndexAtStartLine(regions: LargeJsonViewerRegions, lineNumber: number) {
  let low = 0;
  let high = regions.startLines.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (regions.startLines[middle] < lineNumber) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low < regions.startLines.length && regions.startLines[low] === lineNumber ? low : -1;
}

export function findLastRegionIndexStartingAtOrBefore(regions: LargeJsonViewerRegions, lineNumber: number) {
  let low = 0;
  let high = regions.startLines.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (regions.startLines[middle] <= lineNumber) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low - 1;
}

export function getLargeJsonViewerRegionAtStartLine(regions: LargeJsonViewerRegions, lineNumber: number) {
  return getLargeJsonViewerRegion(regions, findFirstRegionIndexAtStartLine(regions, lineNumber));
}

export function binarySearchLineStarts(lineStarts: Uint32Array, offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = lineStarts[mid];

    if (value <= offset) {
      result = mid;
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  return result;
}

export function findSearchMatchesInLargeJson(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  maxResults?: number
): LargeJsonSearchMatch[] {
  return findTextSearchMatches(text, lineStarts, lineCount, searchTerm, options, maxResults);
}

export function findSearchMatchesBatchInLargeJson(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  startOffset: number,
  maxResults: number
): TextSearchBatch {
  return findTextSearchBatch(text, lineStarts, lineCount, searchTerm, options, startOffset, maxResults);
}
