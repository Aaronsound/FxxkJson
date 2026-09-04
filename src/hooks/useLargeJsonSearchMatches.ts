import { useEffect, useMemo } from 'react';
import type { JsonSearchOptions, LargeJsonSearchMatch, LargeJsonViewerData } from '../types/jsonTool';
import { SEARCH_BATCH_SIZE } from '../types/jsonTool';
import { binarySearchLineStarts, findSearchMatchesInLargeJson } from '../utils/largeJsonViewerData';

interface UseLargeJsonSearchMatchesArgs {
  activeMatchIndex: number;
  data: LargeJsonViewerData;
  onMatchCountChange: (count: number) => void;
  searchMatchesFromWorker?: LargeJsonSearchMatch[];
  searchOptions: JsonSearchOptions;
  searchTerm: string;
  text: string;
}

type IndexedLargeJsonSearchMatch = LargeJsonSearchMatch & { matchIndex: number };
const EMPTY_INDEXED_SEARCH_MATCHES: IndexedLargeJsonSearchMatch[] = [];

export function groupSearchMatchesByLine(searchMatches: LargeJsonSearchMatch[]) {
  const map = new Map<number, IndexedLargeJsonSearchMatch[]>();

  searchMatches.forEach((match, index) => {
    const indexedMatch = match as IndexedLargeJsonSearchMatch;
    indexedMatch.matchIndex = index;
    const lineMatches = map.get(match.lineNumber) ?? [];
    lineMatches.push(indexedMatch);
    map.set(match.lineNumber, lineMatches);
  });

  return map;
}

export function getSearchMatchesForLine(
  matchesByLine: ReadonlyMap<number, IndexedLargeJsonSearchMatch[]>,
  lineNumber: number
) {
  return matchesByLine.get(lineNumber) ?? EMPTY_INDEXED_SEARCH_MATCHES;
}

export function useLargeJsonSearchMatches({
  activeMatchIndex,
  data,
  onMatchCountChange,
  searchMatchesFromWorker,
  searchOptions,
  searchTerm,
  text,
}: UseLargeJsonSearchMatchesArgs) {
  const searchMatches = useMemo(() => {
    const matches =
      searchMatchesFromWorker ??
      findSearchMatchesInLargeJson(text, data.lineStarts, data.lineCount, searchTerm, searchOptions, SEARCH_BATCH_SIZE);
    if (!data.literalChunks) {
      return matches;
    }

    return matches.map((match) => {
      const lineIndex = binarySearchLineStarts(data.lineStarts, match.start);
      const lineStartOffset = data.lineStarts[lineIndex] ?? 0;
      return {
        ...match,
        lineNumber: lineIndex + 1,
        lineStartOffset,
        localStart: match.start - lineStartOffset,
        localEnd: match.end - lineStartOffset,
      };
    });
  }, [data.lineCount, data.lineStarts, data.literalChunks, searchMatchesFromWorker, searchOptions, searchTerm, text]);

  const matchesByLine = useMemo(() => {
    return groupSearchMatchesByLine(searchMatches);
  }, [searchMatches]);

  const effectiveMatchIndex =
    searchMatches.length > 0
      ? ((activeMatchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length
      : 0;
  const activeMatch = searchMatches[effectiveMatchIndex] ?? null;

  useEffect(() => {
    onMatchCountChange(searchMatches.length);
  }, [onMatchCountChange, searchMatches.length]);

  return {
    activeMatch,
    effectiveMatchIndex,
    matchesByLine,
  };
}
