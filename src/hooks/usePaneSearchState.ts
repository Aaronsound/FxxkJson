import { useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import type { JsonSearchOptions } from '../types/jsonTool';

export function usePaneSearchState() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOptions, setSearchOptions] = useState<JsonSearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [matches, setMatches] = useState<monaco.Range[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchNextOffset, setSearchNextOffset] = useState(0);
  const [isSearchLoadingMore, setIsSearchLoadingMore] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [isFindOpen, setIsFindOpen] = useState(false);

  const resetSearchPaging = () => {
    setSearchHasMore(false);
    setSearchNextOffset(0);
    setIsSearchLoadingMore(false);
    setMatchIndex(0);
  };

  const resetSearchState = () => {
    setSearchTerm('');
    setMatches([]);
    resetSearchPaging();
    setIsFindOpen(false);
  };

  return {
    isFindOpen,
    isSearchLoadingMore,
    matchIndex,
    matches,
    resetSearchPaging,
    resetSearchState,
    searchHasMore,
    searchNextOffset,
    searchOptions,
    searchTerm,
    setIsFindOpen,
    setIsSearchLoadingMore,
    setMatchIndex,
    setMatches,
    setSearchHasMore,
    setSearchNextOffset,
    setSearchOptions,
    setSearchTerm,
  };
}
