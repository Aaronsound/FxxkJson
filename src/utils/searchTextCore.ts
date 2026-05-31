import type { JsonSearchOptions, LargeJsonSearchMatch } from '../types/jsonTool';

export interface TextSearchBatch {
  matches: LargeJsonSearchMatch[];
  hasMore: boolean;
  nextStartOffset: number;
  cancelled?: boolean;
}

export function buildLineStarts(text: string) {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      lineStarts.push(index + 1);
    }
  }

  return Uint32Array.from(lineStarts);
}

function isWordChar(char: string | undefined) {
  return typeof char === 'string' && /[A-Za-z0-9_]/.test(char);
}

export function isWholeWordMatch(text: string, start: number, end: number) {
  return !isWordChar(text[start - 1]) && !isWordChar(text[end]);
}

export function getLineMatch(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  start: number,
  end: number
): LargeJsonSearchMatch {
  let low = 0;
  let high = lineStarts.length - 1;
  let lineIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = lineStarts[mid];

    if (value <= start) {
      lineIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineNumber = lineIndex + 1;
  const lineStartOffset = lineStarts[lineIndex] ?? 0;
  const lineEndOffset =
    lineNumber < lineCount ? Math.max(lineStartOffset, (lineStarts[lineNumber] ?? text.length) - 1) : text.length;

  return {
    start,
    end,
    lineNumber,
    lineStartOffset,
    localStart: start - lineStartOffset,
    localEnd: Math.min(end, lineEndOffset) - lineStartOffset,
  };
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getSearchMatcher(searchTerm: string, options: JsonSearchOptions) {
  if (!searchTerm) {
    return null;
  }

  const source = options.useRegex ? searchTerm : escapeRegExp(searchTerm);

  try {
    return new RegExp(source, `g${options.matchCase ? '' : 'i'}`);
  } catch {
    return null;
  }
}

export function cancelledSearchBatch(startOffset: number, textLength: number): TextSearchBatch {
  return {
    matches: [],
    hasMore: false,
    nextStartOffset: Math.min(Math.max(0, startOffset), textLength),
    cancelled: true,
  };
}

export function getEmptySearchBatch(startOffset: number, textLength: number): TextSearchBatch {
  return {
    matches: [],
    hasMore: false,
    nextStartOffset: Math.min(Math.max(0, startOffset), textLength),
  };
}

export function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
