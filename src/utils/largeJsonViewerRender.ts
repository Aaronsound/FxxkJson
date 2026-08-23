import type { LargeJsonSearchMatch, LargeJsonViewerRegions } from '../types/jsonTool';

export interface VisibleSegment {
  actualStart: number;
  actualEnd: number;
  visibleStart: number;
  visibleEnd: number;
}

export interface CollapsedInterval {
  start: number;
  end: number;
  triggerLine: number;
}

export interface LargeJsonWrapLayout {
  lineHeight: number;
  longRowIndexes: Uint32Array;
  visibleLineCount: number;
}

export interface JsonSyntaxToken {
  start: number;
  end: number;
  className?: string;
}

export interface HighlightedJsonLineSegment {
  className?: string;
  isActiveSearchMatch: boolean;
  isSearchMatch: boolean;
  matchIndex?: number;
  text: string;
}

export function getCollapsedPreview(lineText: string) {
  const trimmedEnd = lineText.replace(/\s+$/, '');
  return `${trimmedEnd} ...`;
}

export function binarySearchSegment(segments: VisibleSegment[], visibleIndex: number) {
  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = segments[mid];

    if (visibleIndex < current.visibleStart) {
      high = mid - 1;
      continue;
    }

    if (visibleIndex > current.visibleEnd) {
      low = mid + 1;
      continue;
    }

    return current;
  }

  return null;
}

export function binarySearchActualSegment(segments: VisibleSegment[], lineNumber: number) {
  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = segments[mid];

    if (lineNumber < current.actualStart) {
      high = mid - 1;
      continue;
    }

    if (lineNumber > current.actualEnd) {
      low = mid + 1;
      continue;
    }

    return current;
  }

  return null;
}

export function findCollapsedInterval(intervals: CollapsedInterval[], lineNumber: number) {
  let low = 0;
  let high = intervals.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const interval = intervals[middle];

    if (lineNumber < interval.start) {
      high = middle - 1;
      continue;
    }

    if (lineNumber > interval.end) {
      low = middle + 1;
      continue;
    }

    return interval;
  }

  return null;
}

function appendCollapsedInterval(intervals: CollapsedInterval[], startLine: number, endLine: number) {
  const interval = {
    start: startLine + 1,
    end: endLine - 1,
    triggerLine: startLine,
  };

  if (interval.start > interval.end) {
    return;
  }

  const previous = intervals[intervals.length - 1];
  if (!previous) {
    intervals.push(interval);
    return;
  }

  if (interval.start <= previous.end) {
    previous.end = Math.max(previous.end, interval.end);
    return;
  }

  intervals.push(interval);
}

function findFirstRegionStartingAtOrAfter(startLines: Uint32Array, lineNumber: number, fromIndex: number) {
  let low = Math.max(0, fromIndex);
  let high = startLines.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (startLines[middle] < lineNumber) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function buildAllExceptCollapsedIntervals(
  regions: LargeJsonViewerRegions,
  expandedStartLines: ReadonlySet<number>
) {
  const intervals: CollapsedInterval[] = [];
  let index = 0;

  while (index < regions.startLines.length) {
    const startLine = regions.startLines[index];
    if (expandedStartLines.has(startLine)) {
      index += 1;
      continue;
    }

    const endLine = regions.endLines[index];
    appendCollapsedInterval(intervals, startLine, endLine);

    // Fold regions are stored in document order. Once a parent is collapsed,
    // every following region that starts before its closing line is hidden and
    // cannot contribute another visible trigger or interval.
    index = findFirstRegionStartingAtOrAfter(regions.startLines, endLine, index + 1);
  }

  return intervals;
}

export function buildVisibleSegments(lineCount: number, collapsedIntervals: CollapsedInterval[]): VisibleSegment[] {
  const segments: VisibleSegment[] = [];
  let actualLine = 1;
  let visibleLine = 0;

  collapsedIntervals.forEach((interval) => {
    if (actualLine <= interval.start - 1) {
      const actualStart = actualLine;
      const actualEnd = interval.start - 1;
      const length = actualEnd - actualStart + 1;

      segments.push({
        actualStart,
        actualEnd,
        visibleStart: visibleLine,
        visibleEnd: visibleLine + length - 1,
      });
      visibleLine += length;
    }

    actualLine = Math.max(actualLine, interval.end + 1);
  });

  if (actualLine <= lineCount) {
    const length = lineCount - actualLine + 1;
    segments.push({
      actualStart: actualLine,
      actualEnd: lineCount,
      visibleStart: visibleLine,
      visibleEnd: visibleLine + length - 1,
    });
  }

  return segments;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

const LARGE_JSON_ESTIMATED_CHARACTER_WIDTH = 7.2;
const LARGE_JSON_HORIZONTAL_GUTTER_WIDTH = 40;
export const LARGE_JSON_MAX_WRAPPED_ROWS = 4;

export function getLargeJsonWrapColumnCount(viewportWidth: number, lineNumberDigits: number) {
  const effectiveViewportWidth = viewportWidth > 0 ? viewportWidth : 520;
  const lineNumberWidth = Math.max(3, lineNumberDigits) * LARGE_JSON_ESTIMATED_CHARACTER_WIDTH;
  return Math.max(
    24,
    Math.floor(
      (effectiveViewportWidth - lineNumberWidth - LARGE_JSON_HORIZONTAL_GUTTER_WIDTH) /
        LARGE_JSON_ESTIMATED_CHARACTER_WIDTH
    )
  );
}

interface BuildLargeJsonWrapLayoutArgs {
  lineHeight: number;
  lineStarts: Uint32Array;
  textLength: number;
  visibleLineCount: number;
  visibleSegments: VisibleSegment[];
  wrapColumnCount: number;
}

function growLongRowIndexes(buffer: Uint32Array, minimumCapacity: number) {
  let capacity = Math.max(16, buffer.length);
  while (capacity < minimumCapacity) {
    capacity *= 2;
  }

  const next = new Uint32Array(capacity);
  next.set(buffer);
  return next;
}

function findFirstLongRowAtOrAfter(longRowIndexes: Uint32Array, visibleIndex: number) {
  let low = 0;
  let high = longRowIndexes.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (longRowIndexes[middle] < visibleIndex) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function buildLargeJsonWrapLayout({
  lineHeight,
  lineStarts,
  textLength,
  visibleLineCount,
  visibleSegments,
  wrapColumnCount,
}: BuildLargeJsonWrapLayoutArgs): LargeJsonWrapLayout {
  let longRowIndexes = new Uint32Array(Math.min(Math.max(16, visibleLineCount), 1024));
  let longRowCount = 0;
  const safeWrapColumnCount = Math.max(1, wrapColumnCount);

  for (const segment of visibleSegments) {
    for (let lineNumber = segment.actualStart; lineNumber <= segment.actualEnd; lineNumber += 1) {
      const visibleIndex = segment.visibleStart + (lineNumber - segment.actualStart);
      const lineStart = lineStarts[lineNumber - 1] ?? 0;
      const nextLineStart = lineNumber < lineStarts.length ? lineStarts[lineNumber] : textLength;
      const lineLength = Math.max(0, nextLineStart - lineStart - (lineNumber < lineStarts.length ? 1 : 0));
      if (lineLength <= safeWrapColumnCount) {
        continue;
      }

      if (longRowCount === longRowIndexes.length) {
        longRowIndexes = growLongRowIndexes(longRowIndexes, longRowCount + 1);
      }
      longRowIndexes[longRowCount] = visibleIndex;
      longRowCount += 1;
    }
  }

  return {
    lineHeight,
    longRowIndexes: longRowIndexes.slice(0, longRowCount),
    visibleLineCount,
  };
}

export function getLargeJsonRowTop(layout: LargeJsonWrapLayout, visibleIndex: number) {
  const safeVisibleIndex = Math.max(0, Math.min(visibleIndex, layout.visibleLineCount));
  const longRowsBefore = findFirstLongRowAtOrAfter(layout.longRowIndexes, safeVisibleIndex);
  return (safeVisibleIndex + longRowsBefore * (LARGE_JSON_MAX_WRAPPED_ROWS - 1)) * layout.lineHeight;
}

export function getLargeJsonRowHeight(layout: LargeJsonWrapLayout, visibleIndex: number) {
  const safeVisibleIndex = Math.max(0, Math.min(visibleIndex, Math.max(0, layout.visibleLineCount - 1)));
  const longRowIndex = findFirstLongRowAtOrAfter(layout.longRowIndexes, safeVisibleIndex);
  const isLongRow = layout.longRowIndexes[longRowIndex] === safeVisibleIndex;
  return layout.lineHeight * (isLongRow ? LARGE_JSON_MAX_WRAPPED_ROWS : 1);
}

export function getLargeJsonContentHeight(layout: LargeJsonWrapLayout) {
  return getLargeJsonRowTop(layout, layout.visibleLineCount);
}

export function getLargeJsonVisibleIndexAtOffset(layout: LargeJsonWrapLayout, offset: number) {
  if (layout.visibleLineCount === 0) {
    return 0;
  }

  const target = Math.max(0, offset);
  let low = 0;
  let high = layout.visibleLineCount - 1;

  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (getLargeJsonRowTop(layout, middle) <= target) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
}

function getJsonStringEnd(lineText: string, start: number) {
  let index = start + 1;
  let escaped = false;

  while (index < lineText.length) {
    const char = lineText[index];

    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      return index + 1;
    }

    index += 1;
  }

  return lineText.length;
}

function getNextNonWhitespaceIndex(lineText: string, start: number) {
  let index = start;

  while (index < lineText.length && /\s/.test(lineText[index])) {
    index += 1;
  }

  return index;
}

export function tokenizeJsonLine(lineText: string): JsonSyntaxToken[] {
  const tokens: JsonSyntaxToken[] = [];
  let index = 0;

  const pushToken = (start: number, end: number, className?: string) => {
    if (end > start) {
      tokens.push({ start, end, className });
    }
  };

  while (index < lineText.length) {
    const char = lineText[index];

    if (/\s/.test(char)) {
      const start = index;
      while (index < lineText.length && /\s/.test(lineText[index])) {
        index += 1;
      }
      pushToken(start, index);
      continue;
    }

    if (char === '"') {
      const end = getJsonStringEnd(lineText, index);
      const nextNonWhitespace = getNextNonWhitespaceIndex(lineText, end);
      const className =
        lineText[nextNonWhitespace] === ':'
          ? 'large-json-token large-json-token-key'
          : 'large-json-token large-json-token-value large-json-token-string';

      pushToken(index, end, className);
      index = end;
      continue;
    }

    if (char === '-' || /\d/.test(char)) {
      const match = lineText.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        pushToken(index, index + match[0].length, 'large-json-token large-json-token-value large-json-token-number');
        index += match[0].length;
        continue;
      }
    }

    const literal = ['true', 'false', 'null'].find((candidate) => lineText.startsWith(candidate, index));
    if (literal) {
      pushToken(index, index + literal.length, 'large-json-token large-json-token-value large-json-token-literal');
      index += literal.length;
      continue;
    }

    if ('{}[]:,.'.includes(char)) {
      pushToken(index, index + 1, 'large-json-token large-json-token-punctuation');
      index += 1;
      continue;
    }

    pushToken(index, index + 1);
    index += 1;
  }

  return tokens;
}

export function buildHighlightedJsonLineSegments(
  lineText: string,
  lineMatches: Array<LargeJsonSearchMatch & { matchIndex: number }>,
  activeMatchIndex: number
): HighlightedJsonLineSegment[] {
  const normalizedMatches = lineMatches
    .map((match) => ({
      ...match,
      localStart: clamp(match.localStart, 0, lineText.length),
      localEnd: clamp(match.localEnd, 0, lineText.length),
    }))
    .filter((match) => match.localEnd > match.localStart)
    .sort((left, right) => left.localStart - right.localStart);
  const syntaxTokens = tokenizeJsonLine(lineText);
  const segments: HighlightedJsonLineSegment[] = [];
  let matchCursor = 0;

  const pushSegment = (
    start: number,
    end: number,
    className?: string,
    match?: LargeJsonSearchMatch & { matchIndex: number }
  ) => {
    if (end <= start) {
      return;
    }

    segments.push({
      className,
      isActiveSearchMatch: match?.matchIndex === activeMatchIndex,
      isSearchMatch: Boolean(match),
      matchIndex: match?.matchIndex,
      text: lineText.slice(start, end),
    });
  };

  syntaxTokens.forEach((token) => {
    let cursor = token.start;

    while (cursor < token.end) {
      while (matchCursor < normalizedMatches.length && normalizedMatches[matchCursor].localEnd <= cursor) {
        matchCursor += 1;
      }

      const match = normalizedMatches[matchCursor];
      if (!match || match.localStart >= token.end) {
        pushSegment(cursor, token.end, token.className);
        break;
      }

      if (cursor < match.localStart) {
        const segmentEnd = Math.min(match.localStart, token.end);
        pushSegment(cursor, segmentEnd, token.className);
        cursor = segmentEnd;
        continue;
      }

      const segmentEnd = Math.min(match.localEnd, token.end);
      pushSegment(cursor, segmentEnd, token.className, match);
      cursor = segmentEnd;
    }
  });

  return segments;
}
