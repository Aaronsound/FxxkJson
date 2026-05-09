import type {
  JsonSearchOptions,
  LargeJsonSearchMatch,
} from '../types/jsonTool';

export interface TextSearchBatch {
  matches: LargeJsonSearchMatch[];
  hasMore: boolean;
  nextStartOffset: number;
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

function isWholeWordMatch(text: string, start: number, end: number) {
  return !isWordChar(text[start - 1]) && !isWordChar(text[end]);
}

function getLineMatch(
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
  const lineEndOffset = lineNumber < lineCount
    ? Math.max(lineStartOffset, (lineStarts[lineNumber] ?? text.length) - 1)
    : text.length;

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

export function findTextSearchMatches(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  maxResults = Number.POSITIVE_INFINITY
): LargeJsonSearchMatch[] {
  return findTextSearchBatch(
    text,
    lineStarts,
    lineCount,
    searchTerm,
    options,
    0,
    maxResults
  ).matches;
}

export function findTextSearchBatch(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  startOffset = 0,
  maxResults = Number.POSITIVE_INFINITY
): TextSearchBatch {
  if (!searchTerm || maxResults <= 0) {
    return {
      matches: [],
      hasMore: false,
      nextStartOffset: Math.min(Math.max(0, startOffset), text.length),
    };
  }

  const source = options.useRegex ? searchTerm : escapeRegExp(searchTerm);
  let matcher: RegExp;

  try {
    matcher = new RegExp(source, `g${options.matchCase ? '' : 'i'}`);
  } catch {
    return {
      matches: [],
      hasMore: false,
      nextStartOffset: Math.min(Math.max(0, startOffset), text.length),
    };
  }

  const matches: LargeJsonSearchMatch[] = [];
  let match: RegExpExecArray | null;
  let nextStartOffset = Math.min(Math.max(0, startOffset), text.length);
  matcher.lastIndex = nextStartOffset;

  while ((match = matcher.exec(text)) !== null) {
    const start = match.index;
    const value = match[0];
    const end = start + value.length;

    if (value.length === 0) {
      matcher.lastIndex += 1;
      continue;
    }

    if (!options.wholeWord || isWholeWordMatch(text, start, end)) {
      if (matches.length >= maxResults) {
        return {
          matches,
          hasMore: true,
          nextStartOffset,
        };
      }

      matches.push(getLineMatch(text, lineStarts, lineCount, start, end));
      nextStartOffset = Math.max(end, matcher.lastIndex);
    }
  }

  return {
    matches,
    hasMore: false,
    nextStartOffset,
  };
}
