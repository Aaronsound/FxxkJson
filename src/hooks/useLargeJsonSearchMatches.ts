import { useEffect, useMemo } from 'react';
import type { JsonSearchOptions, LargeJsonSearchMatch, LargeJsonViewerData } from '../types/jsonTool';
import { SEARCH_BATCH_SIZE } from '../types/jsonTool';
import { findSearchMatchesInLargeJson } from '../utils/largeJsonViewerData';

interface UseLargeJsonSearchMatchesArgs {
  activeMatchIndex: number;
  data: LargeJsonViewerData;
  onMatchCountChange: (count: number) => void;
  searchMatchesFromWorker?: LargeJsonSearchMatch[];
  searchOptions: JsonSearchOptions;
  searchTerm: string;
  text: string;
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
  const searchMatches = useMemo(
    () =>
      searchMatchesFromWorker ??
      findSearchMatchesInLargeJson(text, data.lineStarts, data.lineCount, searchTerm, searchOptions, SEARCH_BATCH_SIZE),
    [data.lineCount, data.lineStarts, searchMatchesFromWorker, searchOptions, searchTerm, text]
  );

  const matchesByLine = useMemo(() => {
    const map = new Map<number, Array<LargeJsonSearchMatch & { matchIndex: number }>>();

    searchMatches.forEach((match, index) => {
      const lineMatches = map.get(match.lineNumber) ?? [];
      lineMatches.push({
        ...match,
        matchIndex: index,
      });
      map.set(match.lineNumber, lineMatches);
    });

    return map;
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
