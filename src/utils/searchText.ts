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

function getSearchMatcher(searchTerm: string, options: JsonSearchOptions) {
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

function cancelledSearchBatch(startOffset: number, textLength: number): TextSearchBatch {
  return {
    matches: [],
    hasMore: false,
    nextStartOffset: Math.min(Math.max(0, startOffset), textLength),
    cancelled: true,
  };
}

function getEmptySearchBatch(startOffset: number, textLength: number): TextSearchBatch {
  return {
    matches: [],
    hasMore: false,
    nextStartOffset: Math.min(Math.max(0, startOffset), textLength),
  };
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function findTextSearchMatches(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  maxResults = Number.POSITIVE_INFINITY
): LargeJsonSearchMatch[] {
  return findTextSearchBatch(text, lineStarts, lineCount, searchTerm, options, 0, maxResults).matches;
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
    return getEmptySearchBatch(startOffset, text.length);
  }

  const matcher = getSearchMatcher(searchTerm, options);
  if (!matcher) {
    return getEmptySearchBatch(startOffset, text.length);
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

export function replaceTextSearchMatches(
  text: string,
  searchTerm: string,
  options: JsonSearchOptions,
  replacement: string
) {
  const matcher = getSearchMatcher(searchTerm, options);
  if (!matcher) {
    return text;
  }

  let result = '';
  let copyStart = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const start = match.index;
    const value = match[0];
    const end = start + value.length;

    if (value.length === 0) {
      matcher.lastIndex += 1;
      continue;
    }

    if (options.wholeWord && !isWholeWordMatch(text, start, end)) {
      continue;
    }

    result += text.slice(copyStart, start);
    result += options.useRegex
      ? value.replace(new RegExp(searchTerm, options.matchCase ? '' : 'i'), replacement)
      : replacement;
    copyStart = end;
  }

  return copyStart === 0 ? text : `${result}${text.slice(copyStart)}`;
}

export async function findTextSearchBatchAsync(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  startOffset = 0,
  maxResults = Number.POSITIVE_INFINITY,
  shouldCancel: () => boolean = () => false
): Promise<TextSearchBatch> {
  if (shouldCancel()) {
    return cancelledSearchBatch(startOffset, text.length);
  }

  if (!searchTerm || maxResults <= 0) {
    return getEmptySearchBatch(startOffset, text.length);
  }

  if (options.useRegex) {
    const result = findTextSearchBatch(text, lineStarts, lineCount, searchTerm, options, startOffset, maxResults);

    return shouldCancel() ? cancelledSearchBatch(result.nextStartOffset, text.length) : result;
  }

  const sourceText = options.matchCase ? text : text.toLowerCase();
  const sourceTerm = options.matchCase ? searchTerm : searchTerm.toLowerCase();
  const matches: LargeJsonSearchMatch[] = [];
  let nextStartOffset = Math.min(Math.max(0, startOffset), text.length);
  let index = sourceText.indexOf(sourceTerm, nextStartOffset);
  let iteration = 0;

  while (index !== -1) {
    if (shouldCancel()) {
      return cancelledSearchBatch(nextStartOffset, text.length);
    }

    const start = index;
    const end = start + sourceTerm.length;

    if (!options.wholeWord || isWholeWordMatch(text, start, end)) {
      if (matches.length >= maxResults) {
        return {
          matches,
          hasMore: true,
          nextStartOffset,
        };
      }

      matches.push(getLineMatch(text, lineStarts, lineCount, start, end));
      nextStartOffset = end;
    }

    iteration += 1;
    if (iteration % 250 === 0) {
      await yieldToEventLoop();
      if (shouldCancel()) {
        return cancelledSearchBatch(nextStartOffset, text.length);
      }
    }

    index = sourceText.indexOf(sourceTerm, Math.max(end, index + 1));
  }

  return {
    matches,
    hasMore: false,
    nextStartOffset,
  };
}
