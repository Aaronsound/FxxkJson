import { performance } from 'node:perf_hooks';
import { findNodeAtLocation, getLocation, visit } from 'jsonc-parser';

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

export function measureRepeated(label, iterations, fn) {
  fn();
  let value;
  const result = measure(label, () => {
    for (let index = 0; index < iterations; index += 1) {
      value = fn();
    }
    return value;
  });
  return { ...result, ms: result.ms / iterations };
}

export function createTextPatch(source, updated) {
  const maximumPrefixLength = Math.min(source.length, updated.length);
  let startOffset = 0;
  while (startOffset < maximumPrefixLength && source.charCodeAt(startOffset) === updated.charCodeAt(startOffset)) {
    startOffset += 1;
  }

  let sourceEndOffset = source.length;
  let updatedEndOffset = updated.length;
  while (
    sourceEndOffset > startOffset &&
    updatedEndOffset > startOffset &&
    source.charCodeAt(sourceEndOffset - 1) === updated.charCodeAt(updatedEndOffset - 1)
  ) {
    sourceEndOffset -= 1;
    updatedEndOffset -= 1;
  }

  return {
    sourceLength: source.length,
    startOffset,
    endOffset: sourceEndOffset,
    text: updated.slice(startOffset, updatedEndOffset),
  };
}

export function patchLineStarts(lineStarts, patch) {
  const nextLineStarts = lineStarts.slice();
  const offsetDelta = patch.text.length - (patch.endOffset - patch.startOffset);
  let low = 0;
  let high = nextLineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (nextLineStarts[middle] < patch.endOffset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  for (let index = low; index < nextLineStarts.length; index += 1) {
    nextLineStarts[index] += offsetDelta;
  }
  return nextLineStarts;
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

export function measureDocumentMetrics(text) {
  let textByteLength = 0;
  let lineCount = 1;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) {
      textByteLength += 1;
    } else if (code <= 0x7ff) {
      textByteLength += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = text.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        textByteLength += 4;
        index += 1;
      } else {
        textByteLength += 3;
      }
    } else {
      textByteLength += 3;
    }

    if (code === 0x0a) {
      lineCount += 1;
    }
  }

  return { lineCount, textByteLength };
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
  let regionCount = 0;
  let openedRegionCount = 0;
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
      if (regionCount === regionStartLines.length) {
        const minimumCapacity = regionCount + 1;
        regionStartLines = growTypedBuffer(regionStartLines, minimumCapacity);
        regionEndLines = growTypedBuffer(regionEndLines, minimumCapacity);
        regionParentIndexes = growTypedBuffer(regionParentIndexes, minimumCapacity);
        regionKinds = growTypedBuffer(regionKinds, minimumCapacity);
      }
      if (stackDepth === stackRegionIndexes.length) {
        stackRegionIndexes = growTypedBuffer(stackRegionIndexes, stackDepth + 1);
      }

      regionStartLines[regionCount] = line;
      regionEndLines[regionCount] = line;
      regionParentIndexes[regionCount] = stackDepth > 0 ? stackRegionIndexes[stackDepth - 1] : -1;
      regionKinds[regionCount] = charCode === 91 ? 1 : 0;
      stackRegionIndexes[stackDepth] = regionCount;
      stackDepth += 1;
      regionCount += 1;
      openedRegionCount += 1;
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
        regionCount = Math.min(regionCount, regionIndex);
        continue;
      }

      if (regionStartLines[regionIndex] < line) {
        regionEndLines[regionIndex] = line;
      } else {
        regionCount = Math.min(regionCount, regionIndex);
      }
    }
  }

  const compactLineStarts = lineStarts.length === lineCount ? lineStarts : lineStarts.slice(0, lineCount);
  const regionBuffer = new ArrayBuffer(regionCount * 13);
  const uint32Bytes = regionCount * Uint32Array.BYTES_PER_ELEMENT;
  const compactStartLines = new Uint32Array(regionBuffer, 0, regionCount);
  const compactEndLines = new Uint32Array(regionBuffer, uint32Bytes, regionCount);
  const compactParentIndexes = new Int32Array(regionBuffer, uint32Bytes * 2, regionCount);
  const compactKinds = new Uint8Array(regionBuffer, uint32Bytes * 3, regionCount);
  compactStartLines.set(regionStartLines.subarray(0, regionCount));
  compactEndLines.set(regionEndLines.subarray(0, regionCount));
  compactParentIndexes.set(regionParentIndexes.subarray(0, regionCount));
  compactKinds.set(regionKinds.subarray(0, regionCount));
  const regionIndexBytes = regionBuffer.byteLength;

  return {
    buildWorkingBytes:
      lineStarts.byteLength +
      regionStartLines.byteLength +
      regionEndLines.byteLength +
      regionParentIndexes.byteLength +
      regionKinds.byteLength +
      stackRegionIndexes.byteLength,
    indexBytes: compactLineStarts.byteLength + regionIndexBytes,
    legacyCompactionMapBytes: openedRegionCount * Int32Array.BYTES_PER_ELEMENT,
    lineCount: compactLineStarts.length,
    prunedRegionCount: openedRegionCount - regionCount,
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
    longRowIndexes: compactLongRowIndexes,
    longRowCount,
  };
}

export function rebuildFoldedWrapLayoutStats(
  text,
  lineStarts,
  lineCount,
  hiddenStartLine,
  hiddenEndLine,
  wrapColumnCount = 80
) {
  const hiddenLineCount = Math.max(0, hiddenEndLine - hiddenStartLine + 1);
  let checksum = 0;
  let longRowCount = 0;

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    if (lineNumber >= hiddenStartLine && lineNumber <= hiddenEndLine) {
      continue;
    }

    const lineStart = lineStarts[lineIndex] ?? 0;
    const nextLineStart = lineIndex + 1 < lineCount ? lineStarts[lineIndex + 1] : text.length;
    const lineLength = Math.max(0, nextLineStart - lineStart - (lineIndex + 1 < lineCount ? 1 : 0));
    if (lineLength <= wrapColumnCount) {
      continue;
    }

    const visibleIndex = lineNumber < hiddenStartLine ? lineIndex : lineIndex - hiddenLineCount;
    checksum = (checksum + visibleIndex) >>> 0;
    longRowCount += 1;
  }

  return { checksum, longRowCount };
}

export function projectFoldedWrapLayoutStats(longRowIndexes, hiddenStartLine, hiddenEndLine) {
  const hiddenLineCount = Math.max(0, hiddenEndLine - hiddenStartLine + 1);
  const hiddenStartIndex = Math.max(0, hiddenStartLine - 1);
  const firstHiddenLongRow = findFirstValueAtOrAfter(longRowIndexes, hiddenStartIndex, 0);
  const firstLongRowAfterHidden = findFirstValueAtOrAfter(longRowIndexes, hiddenEndLine, firstHiddenLongRow);
  let checksum = 0;

  for (let index = 0; index < firstHiddenLongRow; index += 1) {
    checksum = (checksum + longRowIndexes[index]) >>> 0;
  }
  for (let index = firstLongRowAfterHidden; index < longRowIndexes.length; index += 1) {
    checksum = (checksum + longRowIndexes[index] - hiddenLineCount) >>> 0;
  }

  return {
    checksum,
    longRowCount: firstHiddenLongRow + longRowIndexes.length - firstLongRowAfterHidden,
  };
}

export function buildTokenizerSampleLines(text, lineStarts, maxLines = 5000) {
  const sampleCount = Math.min(maxLines, lineStarts.length);
  const stride = lineStarts.length / Math.max(1, sampleCount);
  const lines = new Array(sampleCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const lineIndex = Math.floor(sampleIndex * stride);
    const start = lineStarts[lineIndex] ?? 0;
    const nextStart = lineStarts[lineIndex + 1] ?? text.length;
    const end = lineIndex + 1 < lineStarts.length ? Math.max(start, nextStart - 1) : nextStart;
    lines[sampleIndex] = text.slice(start, end);
  }
  return lines;
}

function appendTokenizerStat(stats, start, end, kind) {
  stats.count += 1;
  stats.checksum = (stats.checksum + end * 17 + (end - start) * (kind + 1)) >>> 0;
}

function getTokenizerStringEnd(line, start) {
  let index = start + 1;
  let escaped = false;
  while (index < line.length) {
    const char = line[index];
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      return index + 1;
    }
    index += 1;
  }
  return line.length;
}

export function tokenizeLegacySampleLines(lines) {
  const stats = { count: 0, checksum: 0 };
  for (const line of lines) {
    let index = 0;
    while (index < line.length) {
      const char = line[index];
      if (/\s/.test(char)) {
        const start = index;
        while (index < line.length && /\s/.test(line[index])) index += 1;
        appendTokenizerStat(stats, start, index, 0);
        continue;
      }
      if (char === '"') {
        const end = getTokenizerStringEnd(line, index);
        let next = end;
        while (next < line.length && /\s/.test(line[next])) next += 1;
        appendTokenizerStat(stats, index, end, line[next] === ':' ? 1 : 2);
        index = end;
        continue;
      }
      if (char === '-' || /\d/.test(char)) {
        const match = line.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
        if (match) {
          const end = index + match[0].length;
          appendTokenizerStat(stats, index, end, 3);
          index = end;
          continue;
        }
      }
      const literal = ['true', 'false', 'null'].find((candidate) => line.startsWith(candidate, index));
      if (literal) {
        const end = index + literal.length;
        appendTokenizerStat(stats, index, end, 4);
        index = end;
        continue;
      }
      appendTokenizerStat(stats, index, index + 1, '{}[]:,.'.includes(char) ? 5 : 6);
      index += 1;
    }
  }
  return stats;
}

function isTokenizerWhitespaceCode(charCode) {
  return (
    (charCode >= 9 && charCode <= 13) ||
    charCode === 32 ||
    charCode === 160 ||
    charCode === 5760 ||
    (charCode >= 8192 && charCode <= 8202) ||
    charCode === 8232 ||
    charCode === 8233 ||
    charCode === 8239 ||
    charCode === 8287 ||
    charCode === 12288 ||
    charCode === 65279
  );
}

function isTokenizerDigitCode(charCode) {
  return charCode >= 48 && charCode <= 57;
}

function getTokenizerNumberEnd(line, start) {
  let index = start;
  if (line.charCodeAt(index) === 45) index += 1;
  const firstDigit = line.charCodeAt(index);
  if (firstDigit === 48) {
    index += 1;
  } else if (firstDigit >= 49 && firstDigit <= 57) {
    index += 1;
    while (isTokenizerDigitCode(line.charCodeAt(index))) index += 1;
  } else {
    return start;
  }
  if (line.charCodeAt(index) === 46 && isTokenizerDigitCode(line.charCodeAt(index + 1))) {
    index += 2;
    while (isTokenizerDigitCode(line.charCodeAt(index))) index += 1;
  }
  const exponentCode = line.charCodeAt(index);
  if (exponentCode === 69 || exponentCode === 101) {
    let exponentEnd = index + 1;
    const signCode = line.charCodeAt(exponentEnd);
    if (signCode === 43 || signCode === 45) exponentEnd += 1;
    if (isTokenizerDigitCode(line.charCodeAt(exponentEnd))) {
      exponentEnd += 1;
      while (isTokenizerDigitCode(line.charCodeAt(exponentEnd))) exponentEnd += 1;
      index = exponentEnd;
    }
  }
  return index;
}

function getTokenizerLiteralEnd(line, start) {
  const charCode = line.charCodeAt(start);
  if (charCode === 116 && line.startsWith('true', start)) return start + 4;
  if (charCode === 102 && line.startsWith('false', start)) return start + 5;
  if (charCode === 110 && line.startsWith('null', start)) return start + 4;
  return start;
}

function isTokenizerPunctuationCode(charCode) {
  return (
    charCode === 44 ||
    charCode === 46 ||
    charCode === 58 ||
    charCode === 91 ||
    charCode === 93 ||
    charCode === 123 ||
    charCode === 125
  );
}

export function tokenizeOptimizedSampleLines(lines) {
  const stats = { count: 0, checksum: 0 };
  for (const line of lines) {
    let index = 0;
    while (index < line.length) {
      const charCode = line.charCodeAt(index);
      if (isTokenizerWhitespaceCode(charCode)) {
        const start = index;
        while (index < line.length && isTokenizerWhitespaceCode(line.charCodeAt(index))) index += 1;
        appendTokenizerStat(stats, start, index, 0);
        continue;
      }
      if (charCode === 34) {
        const end = getTokenizerStringEnd(line, index);
        let next = end;
        while (next < line.length && isTokenizerWhitespaceCode(line.charCodeAt(next))) next += 1;
        appendTokenizerStat(stats, index, end, line.charCodeAt(next) === 58 ? 1 : 2);
        index = end;
        continue;
      }
      if (charCode === 45 || isTokenizerDigitCode(charCode)) {
        const end = getTokenizerNumberEnd(line, index);
        if (end > index) {
          appendTokenizerStat(stats, index, end, 3);
          index = end;
          continue;
        }
      }
      const literalEnd = getTokenizerLiteralEnd(line, index);
      if (literalEnd > index) {
        appendTokenizerStat(stats, index, literalEnd, 4);
        index = literalEnd;
        continue;
      }
      appendTokenizerStat(stats, index, index + 1, isTokenizerPunctuationCode(charCode) ? 5 : 6);
      index += 1;
    }
  }
  return stats;
}

function createPackedRawViewerBuffers(capacity) {
  const startsByteLength = capacity * Uint32Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(startsByteLength + capacity * Uint16Array.BYTES_PER_ELEMENT);
  return {
    lengths: new Uint16Array(buffer, startsByteLength, capacity),
    starts: new Uint32Array(buffer, 0, capacity),
  };
}

function createRawViewerStatsBuilder(text, chunkSize) {
  let { lengths, starts } = createPackedRawViewerBuffers(Math.max(1024, Math.ceil(text.length / chunkSize)));
  let rowCount = 0;
  let growthCopyBytes = 0;

  const appendRow = (start, end) => {
    if (rowCount === starts.length) {
      growthCopyBytes += starts.byteLength + lengths.byteLength;
      const next = createPackedRawViewerBuffers(starts.length * 2);
      next.starts.set(starts);
      next.lengths.set(lengths);
      starts = next.starts;
      lengths = next.lengths;
    }
    starts[rowCount] = start;
    lengths[rowCount] = end - start;
    rowCount += 1;
  };

  return {
    appendLine(start, end) {
      if (start === end) {
        appendRow(start, end);
        return;
      }

      let segmentStart = start;
      while (segmentStart < end) {
        const segmentEnd = Math.min(end, segmentStart + chunkSize);
        appendRow(segmentStart, segmentEnd);
        segmentStart = segmentEnd;
      }
    },
    finish() {
      const bytesPerRow = Uint32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT;
      const reusedScrollRowCount = Math.min(40, Math.max(0, rowCount - 1));
      let memoizedScrollSliceCharsAvoided = 0;
      for (let rowIndex = 0; rowIndex < reusedScrollRowCount; rowIndex += 1) {
        memoizedScrollSliceCharsAvoided += lengths[rowIndex];
      }

      let legacyCapacity = 1024;
      let legacyGrowthCopyBytes = 0;
      while (legacyCapacity < rowCount) {
        legacyGrowthCopyBytes += legacyCapacity * bytesPerRow;
        legacyCapacity *= 2;
      }
      const indexBytes = rowCount * bytesPerRow;

      return {
        finalCompactionCopyBytes: starts.length === rowCount ? 0 : indexBytes,
        growthCopyBytes,
        indexBytes,
        legacyFinalCompactionCopyBytes: indexBytes,
        legacyGrowthCopyBytes,
        legacyIndexBytes: rowCount * Uint32Array.BYTES_PER_ELEMENT * 2,
        legacyTransferBufferCount: 2,
        memoizedScrollRowsAvoided: reusedScrollRowCount,
        memoizedScrollSliceCharsAvoided,
        rowCount,
        transferBufferCount: 1,
        workingBytes: starts.byteLength + lengths.byteLength,
      };
    },
  };
}

export function buildRawViewerDataStats(text, chunkSize = 2000) {
  const builder = createRawViewerStatsBuilder(text, chunkSize);
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;

    builder.appendLine(lineStart, lineEnd);

    if (newlineIndex === -1) {
      break;
    }
    lineStart = newlineIndex + 1;
    if (lineStart === text.length) {
      builder.appendLine(lineStart, lineStart);
      break;
    }
  }

  return builder.finish();
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

function isLegacyWordChar(char) {
  return typeof char === 'string' && /[A-Za-z0-9_]/.test(char);
}

function isWordCharCode(charCode) {
  return (
    (charCode >= 48 && charCode <= 57) ||
    (charCode >= 65 && charCode <= 90) ||
    charCode === 95 ||
    (charCode >= 97 && charCode <= 122)
  );
}

function findLineIndex(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  let lineIndex = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) {
      lineIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return lineIndex;
}

export function findLegacyLineAwareLiteralBatch(text, query, lineStarts, maxResults = RIGHT_SEARCH_BATCH_SIZE) {
  const matcher = new RegExp(escapeSearchPattern(query), 'g');
  let count = 0;
  let lineChecksum = 0;
  let match;
  while ((match = matcher.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (isLegacyWordChar(text[start - 1]) || isLegacyWordChar(text[end])) {
      continue;
    }
    if (count >= maxResults) {
      break;
    }
    lineChecksum += findLineIndex(lineStarts, start);
    count += 1;
  }
  return { count, lineChecksum };
}

export function findOptimizedLineAwareLiteralBatch(text, query, lineStarts, maxResults = RIGHT_SEARCH_BATCH_SIZE) {
  let count = 0;
  let lineChecksum = 0;
  let lineIndex = 0;
  let offset = 0;
  while (offset < text.length) {
    const start = text.indexOf(query, offset);
    if (start < 0) {
      break;
    }
    const end = start + query.length;
    offset = end;
    if (isWordCharCode(text.charCodeAt(start - 1)) || isWordCharCode(text.charCodeAt(end))) {
      continue;
    }
    if (count >= maxResults) {
      break;
    }
    while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1] <= start) {
      lineIndex += 1;
    }
    lineChecksum += lineIndex;
    count += 1;
  }
  return { count, lineChecksum };
}

export function replaceLegacyExactMatches(text, query, replacement) {
  const matcher = new RegExp(escapeSearchPattern(query), 'g');
  let result = '';
  let copyStart = 0;
  let match;

  while ((match = matcher.exec(text)) !== null) {
    result += text.slice(copyStart, match.index);
    result += replacement;
    copyStart = match.index + match[0].length;
  }

  return copyStart === 0 ? text : `${result}${text.slice(copyStart)}`;
}

export function replaceLiteralMatches(text, query, replacement) {
  if (!query) {
    return text;
  }

  let result = '';
  let copyStart = 0;
  let searchStart = 0;
  while (searchStart < text.length) {
    const start = text.indexOf(query, searchStart);
    if (start === -1) {
      break;
    }
    const end = start + query.length;
    result += text.slice(copyStart, start);
    result += replacement;
    copyStart = end;
    searchStart = end;
  }

  return copyStart === 0 ? text : `${result}${text.slice(copyStart)}`;
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

function findStreamingJsonPathRange(text, targetPath) {
  let range = null;
  let targetContainer = null;
  const rangeFound = Symbol('range-found');
  const pathsEqual = (left, right) =>
    left.length === right.length && left.every((segment, index) => segment === right[index]);
  const isPrefix = (prefix, path) =>
    prefix.length <= path.length && prefix.every((segment, index) => segment === path[index]);
  const beginContainer = (kind, offset, pathSupplier) => {
    if (range) {
      return false;
    }
    const currentPath = pathSupplier();
    if (pathsEqual(currentPath, targetPath)) {
      targetContainer = { kind, startOffset: offset };
      return false;
    }
    return isPrefix(currentPath, targetPath);
  };
  const endContainer = (kind, offset, length) => {
    if (!range && targetContainer?.kind === kind) {
      range = { startOffset: targetContainer.startOffset, endOffset: offset + length };
      throw rangeFound;
    }
  };

  try {
    visit(text, {
      onArrayBegin: (offset, _length, _line, _character, pathSupplier) => beginContainer('array', offset, pathSupplier),
      onArrayEnd: (offset, length) => endContainer('array', offset, length),
      onLiteralValue: (_value, offset, length, _line, _character, pathSupplier) => {
        if (!range && pathsEqual(pathSupplier(), targetPath)) {
          range = { startOffset: offset, endOffset: offset + length };
          throw rangeFound;
        }
      },
      onObjectBegin: (offset, _length, _line, _character, pathSupplier) =>
        beginContainer('object', offset, pathSupplier),
      onObjectEnd: (offset, length) => endContainer('object', offset, length),
    });
  } catch (error) {
    if (error !== rangeFound) {
      throw error;
    }
  }

  return range;
}

export function readFirstRequestValueStreaming(rawText, formattedText) {
  const offset = formattedText.indexOf('"req-');
  if (offset === -1) {
    return null;
  }

  const path = getLocation(formattedText, offset).path;
  const rawRange = findStreamingJsonPathRange(rawText, path);
  const formattedRange = findStreamingJsonPathRange(formattedText, path);
  return rawRange && formattedRange ? { formattedRange, path, rawRange } : null;
}
