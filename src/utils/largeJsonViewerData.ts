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

const INITIAL_LINE_INDEX_CAPACITY = 4096;
const INITIAL_REGION_INDEX_CAPACITY = 1024;

function growUint32Buffer(buffer: Uint32Array, minimumCapacity: number) {
  let capacity = Math.max(1, buffer.length);
  while (capacity < minimumCapacity) {
    capacity = Math.max(minimumCapacity, capacity * 2);
  }

  const next = new Uint32Array(capacity);
  next.set(buffer);
  return next;
}

function growInt32Buffer(buffer: Int32Array, minimumCapacity: number) {
  let capacity = Math.max(1, buffer.length);
  while (capacity < minimumCapacity) {
    capacity = Math.max(minimumCapacity, capacity * 2);
  }

  const next = new Int32Array(capacity);
  next.set(buffer);
  return next;
}

function growUint8Buffer(buffer: Uint8Array, minimumCapacity: number) {
  let capacity = Math.max(1, buffer.length);
  while (capacity < minimumCapacity) {
    capacity = Math.max(minimumCapacity, capacity * 2);
  }

  const next = new Uint8Array(capacity);
  next.set(buffer);
  return next;
}

export function buildLargeViewerData(
  text: string,
  lineThreshold = DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD,
  lineCapacityHint?: number
): LargeJsonViewerData | null {
  const initialLineCapacity =
    typeof lineCapacityHint === 'number' && Number.isSafeInteger(lineCapacityHint) && lineCapacityHint > 0
      ? lineCapacityHint
      : INITIAL_LINE_INDEX_CAPACITY;
  let lineStarts = new Uint32Array(initialLineCapacity);
  lineStarts[0] = 0;
  let lineCount = 1;
  let regionStartLines = new Uint32Array(INITIAL_REGION_INDEX_CAPACITY);
  let regionEndLines = new Uint32Array(INITIAL_REGION_INDEX_CAPACITY);
  let regionParentIndexes = new Int32Array(INITIAL_REGION_INDEX_CAPACITY);
  let regionKinds = new Uint8Array(INITIAL_REGION_INDEX_CAPACITY);
  let stackRegionIndexes = new Int32Array(INITIAL_REGION_INDEX_CAPACITY);
  let regionCount = 0;
  let stackDepth = 0;
  let line = 1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const charCode = text.charCodeAt(index);

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (charCode === 92) {
        escaping = true;
        continue;
      }

      if (charCode === 34) {
        inString = false;
      }
      continue;
    }

    if (charCode === 34) {
      inString = true;
      continue;
    }

    if (charCode === 10) {
      line += 1;
      if (lineCount === lineStarts.length) {
        lineStarts = growUint32Buffer(lineStarts, lineCount + 1);
      }
      lineStarts[lineCount] = index + 1;
      lineCount += 1;
      continue;
    }

    if (charCode === 123 || charCode === 91) {
      if (regionCount === regionStartLines.length) {
        const minimumCapacity = regionCount + 1;
        regionStartLines = growUint32Buffer(regionStartLines, minimumCapacity);
        regionEndLines = growUint32Buffer(regionEndLines, minimumCapacity);
        regionParentIndexes = growInt32Buffer(regionParentIndexes, minimumCapacity);
        regionKinds = growUint8Buffer(regionKinds, minimumCapacity);
      }
      if (stackDepth === stackRegionIndexes.length) {
        stackRegionIndexes = growInt32Buffer(stackRegionIndexes, stackDepth + 1);
      }

      regionStartLines[regionCount] = line;
      regionEndLines[regionCount] = line;
      regionParentIndexes[regionCount] = stackDepth > 0 ? stackRegionIndexes[stackDepth - 1] : -1;
      regionKinds[regionCount] = charCode === 91 ? 1 : 0;
      stackRegionIndexes[stackDepth] = regionCount;
      stackDepth += 1;
      regionCount += 1;
      continue;
    }

    if (charCode === 125 || charCode === 93) {
      if (stackDepth === 0) {
        continue;
      }

      stackDepth -= 1;
      const regionIndex = stackRegionIndexes[stackDepth];
      const expectedKind = charCode === 93 ? 1 : 0;
      if (regionKinds[regionIndex] !== expectedKind) {
        continue;
      }

      regionEndLines[regionIndex] = line;
    }
  }

  if (lineCount <= lineThreshold) {
    return null;
  }

  const originalRegionCount = regionCount;
  const originalToCompactIndex = new Int32Array(originalRegionCount);
  originalToCompactIndex.fill(-1);
  regionCount = 0;
  for (let index = 0; index < originalRegionCount; index += 1) {
    if (regionStartLines[index] < regionEndLines[index]) {
      originalToCompactIndex[index] = regionCount;
      regionCount += 1;
    }
  }

  for (let index = 0; index < originalRegionCount; index += 1) {
    const parentIndex = regionParentIndexes[index];
    regionParentIndexes[index] =
      parentIndex < 0
        ? -1
        : originalToCompactIndex[parentIndex] >= 0
          ? originalToCompactIndex[parentIndex]
          : regionParentIndexes[parentIndex];
  }

  let compactIndex = 0;

  for (let index = 0; index < originalRegionCount; index += 1) {
    if (originalToCompactIndex[index] < 0) {
      continue;
    }

    regionStartLines[compactIndex] = regionStartLines[index];
    regionEndLines[compactIndex] = regionEndLines[index];
    regionParentIndexes[compactIndex] = regionParentIndexes[index];
    regionKinds[compactIndex] = regionKinds[index];
    compactIndex += 1;
  }

  return {
    lineStarts: lineStarts.length === lineCount ? lineStarts : lineStarts.slice(0, lineCount),
    regions: {
      startLines: regionStartLines.slice(0, regionCount),
      endLines: regionEndLines.slice(0, regionCount),
      parentIndexes: regionParentIndexes.slice(0, regionCount),
      kinds: regionKinds.slice(0, regionCount),
    },
    lineCount,
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
