import type { JsonSearchOptions, LargeJsonSearchMatch } from '../types/jsonTool';
import {
  cancelledSearchBatch,
  getEmptySearchBatch,
  getLineMatch,
  getSearchMatcher,
  isWholeWordMatch,
  type TextSearchBatch,
  yieldToEventLoop,
} from './searchTextCore';

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

export async function findTextSearchBatchAsync(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  startOffset = 0,
  maxResults = Number.POSITIVE_INFINITY,
  shouldCancel: () => boolean = () => false,
  normalizedText?: string
): Promise<TextSearchBatch> {
  if (shouldCancel()) {
    return cancelledSearchBatch(startOffset, text.length);
  }

  if (!searchTerm || maxResults <= 0) {
    return getEmptySearchBatch(startOffset, text.length);
  }

  if (options.useRegex) {
    return findRegexTextSearchBatchAsync(
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

  return findPlainTextSearchBatchAsync(
    text,
    lineStarts,
    lineCount,
    searchTerm,
    options,
    startOffset,
    maxResults,
    shouldCancel,
    normalizedText
  );
}

async function findRegexTextSearchBatchAsync(
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

      matches.push(getLineMatch(text, lineStarts, lineCount, start, end));
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

async function findPlainTextSearchBatchAsync(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions,
  startOffset: number,
  maxResults: number,
  shouldCancel: () => boolean,
  normalizedText?: string
): Promise<TextSearchBatch> {
  const sourceText = options.matchCase ? text : (normalizedText ?? text.toLowerCase());
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
