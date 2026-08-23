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

function growTypedBuffer(buffer, minimumCapacity) {
  let capacity = Math.max(1, buffer.length);
  while (capacity < minimumCapacity) {
    capacity = Math.max(minimumCapacity, capacity * 2);
  }

  const next = new buffer.constructor(capacity);
  next.set(buffer);
  return next;
}

export function countTextLines(text) {
  let lineCount = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lineCount += 1;
    }
  }
  return lineCount;
}

export function buildViewerDataStats(text, expectedLineCount) {
  let lineStarts = new Uint32Array(expectedLineCount > 0 ? expectedLineCount : 4096);
  lineStarts[0] = 0;
  let lineCount = 1;
  let regionStartLines = new Uint32Array(1024);
  let regionEndLines = new Uint32Array(1024);
  let regionParentIndexes = new Int32Array(1024);
  let regionKinds = new Uint8Array(1024);
  let stackRegionIndexes = new Int32Array(1024);
  let originalRegionCount = 0;
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
        lineStarts = growTypedBuffer(lineStarts, lineCount + 1);
      }
      lineStarts[lineCount] = index + 1;
      lineCount += 1;
      continue;
    }

    if (charCode === 123 || charCode === 91) {
      if (originalRegionCount === regionStartLines.length) {
        const minimumCapacity = originalRegionCount + 1;
        regionStartLines = growTypedBuffer(regionStartLines, minimumCapacity);
        regionEndLines = growTypedBuffer(regionEndLines, minimumCapacity);
        regionParentIndexes = growTypedBuffer(regionParentIndexes, minimumCapacity);
        regionKinds = growTypedBuffer(regionKinds, minimumCapacity);
      }
      if (stackDepth === stackRegionIndexes.length) {
        stackRegionIndexes = growTypedBuffer(stackRegionIndexes, stackDepth + 1);
      }

      regionStartLines[originalRegionCount] = line;
      regionEndLines[originalRegionCount] = line;
      regionParentIndexes[originalRegionCount] = stackDepth > 0 ? stackRegionIndexes[stackDepth - 1] : -1;
      regionKinds[originalRegionCount] = charCode === 91 ? 1 : 0;
      stackRegionIndexes[stackDepth] = originalRegionCount;
      stackDepth += 1;
      originalRegionCount += 1;
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

  const originalToCompactIndex = new Int32Array(originalRegionCount);
  originalToCompactIndex.fill(-1);
  let regionCount = 0;
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

  const compactLineStarts = lineStarts.length === lineCount ? lineStarts : lineStarts.slice(0, lineCount);
  const compactStartLines = regionStartLines.slice(0, regionCount);
  const compactEndLines = regionEndLines.slice(0, regionCount);
  const compactParentIndexes = regionParentIndexes.slice(0, regionCount);
  const compactKinds = regionKinds.slice(0, regionCount);
  const regionIndexBytes =
    compactStartLines.byteLength +
    compactEndLines.byteLength +
    compactParentIndexes.byteLength +
    compactKinds.byteLength;

  return {
    buildWorkingBytes:
      lineStarts.byteLength +
      regionStartLines.byteLength +
      regionEndLines.byteLength +
      regionParentIndexes.byteLength +
      regionKinds.byteLength +
      stackRegionIndexes.byteLength +
      originalToCompactIndex.byteLength,
    indexBytes: compactLineStarts.byteLength + regionIndexBytes,
    lineCount: compactLineStarts.length,
    regionCount,
    regionIndexBytes,
    lineStarts: compactLineStarts,
    regions: {
      startLines: compactStartLines,
      endLines: compactEndLines,
    },
  };
}

function findFirstValueAtOrAfter(values, target, fromIndex = 0) {
  let low = Math.max(0, fromIndex);
  let high = values.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function buildFoldAllStats(regions) {
  let index = 0;
  let intervalCount = 0;
  let visitedRegionCount = 0;

  while (index < regions.startLines.length) {
    const startLine = regions.startLines[index];
    const endLine = regions.endLines[index];
    visitedRegionCount += 1;
    if (startLine + 1 <= endLine - 1) {
      intervalCount += 1;
    }
    index = findFirstValueAtOrAfter(regions.startLines, endLine, index + 1);
  }

  return { intervalCount, visitedRegionCount };
}

export function buildWrapLayoutStats(text, lineStarts, lineCount, wrapColumnCount = 80) {
  let longRowIndexes = new Uint32Array(Math.min(Math.max(16, lineCount), 1024));
  let longRowCount = 0;

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const lineStart = lineStarts[lineIndex] ?? 0;
    const nextLineStart = lineIndex + 1 < lineCount ? lineStarts[lineIndex + 1] : text.length;
    const lineLength = Math.max(0, nextLineStart - lineStart - (lineIndex + 1 < lineCount ? 1 : 0));
    if (lineLength <= wrapColumnCount) {
      continue;
    }

    if (longRowCount === longRowIndexes.length) {
      longRowIndexes = growTypedBuffer(longRowIndexes, longRowCount + 1);
    }
    longRowIndexes[longRowCount] = lineIndex;
    longRowCount += 1;
  }

  const compactLongRowIndexes = longRowIndexes.slice(0, longRowCount);
  return {
    indexBytes: compactLongRowIndexes.byteLength,
    longRowCount,
  };
}

export function buildRawViewerDataStats(text, chunkSize = 2000) {
  let starts = new Uint32Array(1024);
  let lengths = new Uint16Array(1024);
  let rowCount = 0;
  let lineStart = 0;

  const appendRow = (start, end) => {
    if (rowCount === starts.length) {
      starts = growTypedBuffer(starts, rowCount + 1);
      lengths = growTypedBuffer(lengths, rowCount + 1);
    }
    starts[rowCount] = start;
    lengths[rowCount] = end - start;
    rowCount += 1;
  };

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;

    if (lineStart === lineEnd) {
      appendRow(lineStart, lineEnd);
    } else {
      let segmentStart = lineStart;
      while (segmentStart < lineEnd) {
        const segmentEnd = Math.min(lineEnd, segmentStart + chunkSize);
        appendRow(segmentStart, segmentEnd);
        segmentStart = segmentEnd;
      }
    }

    if (newlineIndex === -1) {
      break;
    }
    lineStart = newlineIndex + 1;
    if (lineStart === text.length) {
      appendRow(lineStart, lineStart);
      break;
    }
  }

  return {
    indexBytes: rowCount * (Uint32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT),
    legacyIndexBytes: rowCount * Uint32Array.BYTES_PER_ELEMENT * 2,
    rowCount,
    workingBytes: starts.byteLength + lengths.byteLength,
  };
}

function escapeSearchPattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findCaseInsensitiveSearchBatch(text, query, startOffset = 0, maxResults = RIGHT_SEARCH_BATCH_SIZE) {
  const matcher = new RegExp(escapeSearchPattern(query), 'gi');
  const matches = [];
  let nextStartOffset = Math.min(Math.max(0, startOffset), text.length);
  matcher.lastIndex = nextStartOffset;
  let match;

  while ((match = matcher.exec(text)) !== null) {
    if (matches.length >= maxResults) {
      return { count: matches.length, hasMore: true, nextStartOffset };
    }
    matches.push(match.index);
    nextStartOffset = matcher.lastIndex;
  }

  return { count: matches.length, hasMore: false, nextStartOffset };
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
