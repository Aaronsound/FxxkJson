import type { JsonSearchOptions, LargeJsonSearchMatch } from '../types/jsonTool';

export interface TextSearchBatch {
  matches: LargeJsonSearchMatch[];
  hasMore: boolean;
  nextStartOffset: number;
  cancelled?: boolean;
}

const MAX_REGEX_SEARCH_PATTERN_LENGTH = 512;
const NESTED_QUANTIFIER_PATTERN =
  /\((?:[^()[\]\\]|\\.|\[[^\]]*\])*(?:[+*]|\{\d+(?:,\d*)?\})(?:[^()[\]\\]|\\.|\[[^\]]*\])*\)(?:[+*]|\{\d+(?:,\d*)?\})/;

export function buildLineStarts(text: string) {
  const inlineLineStarts = [0];
  let lineStarts: Uint32Array | null = null;
  let lineCount = 1;

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) !== 10) {
      continue;
    }

    if (!lineStarts && lineCount < 4096) {
      inlineLineStarts.push(index + 1);
      lineCount += 1;
      continue;
    }

    let currentLineStarts: Uint32Array | null = lineStarts;
    if (!currentLineStarts) {
      currentLineStarts = new Uint32Array(8192);
      currentLineStarts.set(inlineLineStarts);
    } else if (lineCount === currentLineStarts.length) {
      const nextLineStarts: Uint32Array = new Uint32Array(currentLineStarts.length * 2);
      nextLineStarts.set(currentLineStarts);
      currentLineStarts = nextLineStarts;
    }

    currentLineStarts[lineCount] = index + 1;
    lineStarts = currentLineStarts;
    lineCount += 1;
  }

  return lineStarts ? lineStarts.slice(0, lineCount) : Uint32Array.from(inlineLineStarts);
}

function isWordCharCode(charCode: number) {
  return (
    (charCode >= 48 && charCode <= 57) ||
    (charCode >= 65 && charCode <= 90) ||
    charCode === 95 ||
    (charCode >= 97 && charCode <= 122)
  );
}

export function isWholeWordMatch(text: string, start: number, end: number) {
  return !isWordCharCode(text.charCodeAt(start - 1)) && !isWordCharCode(text.charCodeAt(end));
}

function findLineIndexAtOffset(lineStarts: Uint32Array, lineCount: number, offset: number) {
  let low = 0;
  let high = Math.min(lineCount, lineStarts.length) - 1;
  let lineIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      lineIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return lineIndex;
}

export function createLineMatchResolver(text: string, lineStarts: Uint32Array, lineCount: number, startOffset: number) {
  let lineIndex = findLineIndexAtOffset(lineStarts, lineCount, startOffset);

  return (start: number, end: number): LargeJsonSearchMatch => {
    while (lineIndex > 0 && lineStarts[lineIndex] > start) {
      lineIndex -= 1;
    }

    while (lineIndex + 1 < lineCount && lineStarts[lineIndex + 1] <= start) {
      lineIndex += 1;
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
  };
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getSearchMatcher(searchTerm: string, options: JsonSearchOptions) {
  if (!searchTerm) {
    return null;
  }

  if (
    options.useRegex &&
    (searchTerm.length > MAX_REGEX_SEARCH_PATTERN_LENGTH || NESTED_QUANTIFIER_PATTERN.test(searchTerm))
  ) {
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
