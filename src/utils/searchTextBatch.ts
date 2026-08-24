import type { JsonSearchOptions, LargeJsonSearchMatch } from '../types/jsonTool';
import {
  cancelledSearchBatch,
  createLineMatchResolver,
  getEmptySearchBatch,
  getSearchMatcher,
  isWholeWordMatch,
  type TextSearchBatch,
  yieldToEventLoop,
} from './searchTextCore';

function findCaseSensitiveLiteralSearchBatch(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  startOffset: number,
  maxResults: number
): TextSearchBatch {
  const matches: LargeJsonSearchMatch[] = [];
  let nextStartOffset = Math.min(Math.max(0, startOffset), text.length);
  let searchOffset = nextStartOffset;
  const resolveLineMatch = createLineMatchResolver(text, lineStarts, lineCount, nextStartOffset);

  while (searchOffset < text.length) {
    const start = text.indexOf(searchTerm, searchOffset);
    if (start < 0) {
      break;
    }

    const end = start + searchTerm.length;
    searchOffset = end;
    if (options.wholeWord && !isWholeWordMatch(text, start, end)) {
      continue;
    }

    if (matches.length >= maxResults) {
      return { matches, hasMore: true, nextStartOffset };
    }

    matches.push(resolveLineMatch(start, end));
    nextStartOffset = end;
  }

  return { matches, hasMore: false, nextStartOffset };
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

  if (!options.useRegex && options.matchCase) {
    return findCaseSensitiveLiteralSearchBatch(
      text,
      lineStarts,
      lineCount,
      searchTerm,
      options,
      startOffset,
      maxResults
    );
  }

  const matcher = getSearchMatcher(searchTerm, options);
  if (!matcher) {
    return getEmptySearchBatch(startOffset, text.length);
  }

  const matches: LargeJsonSearchMatch[] = [];
  let match: RegExpExecArray | null;
  let nextStartOffset = Math.min(Math.max(0, startOffset), text.length);
  const resolveLineMatch = createLineMatchResolver(text, lineStarts, lineCount, nextStartOffset);
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

      matches.push(resolveLineMatch(start, end));
      nextStartOffset = Math.max(end, matcher.lastIndex);
    }
  }

  return {
    matches,
    hasMore: false,
    nextStartOffset,
  };
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

  if (!options.useRegex && options.matchCase) {
    return findCaseSensitiveLiteralSearchBatchAsync(
      text,
      lineStarts,
      lineCount,
      searchTerm,
      options,
      startOffset,
      maxResults,
      shouldCancel
    );
  }

  return findPatternTextSearchBatchAsync(
    text,
    lineStarts,
    lineCount,
    searchTerm,
    options,
    startOffset,
    maxResults,
    shouldCancel
  );
}

async function findCaseSensitiveLiteralSearchBatchAsync(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  startOffset: number,
  maxResults: number,
  shouldCancel: () => boolean
): Promise<TextSearchBatch> {
  const matches: LargeJsonSearchMatch[] = [];
  let nextStartOffset = Math.min(Math.max(0, startOffset), text.length);
  let searchOffset = nextStartOffset;
  let iteration = 0;
  const resolveLineMatch = createLineMatchResolver(text, lineStarts, lineCount, nextStartOffset);

  while (searchOffset < text.length) {
    if (shouldCancel()) {
      return cancelledSearchBatch(nextStartOffset, text.length);
    }

    const start = text.indexOf(searchTerm, searchOffset);
    if (start < 0) {
      break;
    }

    const end = start + searchTerm.length;
    searchOffset = end;
    if (!options.wholeWord || isWholeWordMatch(text, start, end)) {
      if (matches.length >= maxResults) {
        return { matches, hasMore: true, nextStartOffset };
      }

      matches.push(resolveLineMatch(start, end));
      nextStartOffset = end;
    }

    iteration += 1;
    if (iteration % 250 === 0) {
      await yieldToEventLoop();
      if (shouldCancel()) {
        return cancelledSearchBatch(nextStartOffset, text.length);
      }
    }
  }

  return { matches, hasMore: false, nextStartOffset };
}

async function findPatternTextSearchBatchAsync(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  startOffset: number,
  maxResults: number,
  shouldCancel: () => boolean
): Promise<TextSearchBatch> {
  const matcher = getSearchMatcher(searchTerm, options);
  if (!matcher) {
    return getEmptySearchBatch(startOffset, text.length);
  }

  const matches: LargeJsonSearchMatch[] = [];
  let nextStartOffset = Math.min(Math.max(0, startOffset), text.length);
  let iteration = 0;
  let match: RegExpExecArray | null;
  const resolveLineMatch = createLineMatchResolver(text, lineStarts, lineCount, nextStartOffset);
  matcher.lastIndex = nextStartOffset;

  while ((match = matcher.exec(text)) !== null) {
    if (shouldCancel()) {
      return cancelledSearchBatch(nextStartOffset, text.length);
    }

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

      matches.push(resolveLineMatch(start, end));
      nextStartOffset = Math.max(end, matcher.lastIndex);
    }

    iteration += 1;
    if (iteration % 250 === 0) {
      await yieldToEventLoop();
      if (shouldCancel()) {
        return cancelledSearchBatch(nextStartOffset, text.length);
      }
    }
  }

  return {
    matches,
    hasMore: false,
    nextStartOffset,
  };
}
