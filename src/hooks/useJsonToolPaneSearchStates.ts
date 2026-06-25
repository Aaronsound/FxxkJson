import { usePaneSearchState } from './usePaneSearchState';

export function useJsonToolPaneSearchStates() {
  const leftPaneSearch = usePaneSearchState();
  const rightPaneSearch = usePaneSearchState();

  return {
    isLeftFindOpen: leftPaneSearch.isFindOpen,
    isLeftSearchLoadingMore: leftPaneSearch.isSearchLoadingMore,
    isRightFindOpen: rightPaneSearch.isFindOpen,
    isRightSearchLoadingMore: rightPaneSearch.isSearchLoadingMore,
    leftMatchIndex: leftPaneSearch.matchIndex,
    leftMatches: leftPaneSearch.matches,
    leftSearchHasMore: leftPaneSearch.searchHasMore,
    leftSearchNextOffset: leftPaneSearch.searchNextOffset,
    leftSearchOptions: leftPaneSearch.searchOptions,
    leftSearchTerm: leftPaneSearch.searchTerm,
    resetLeftSearchPaging: leftPaneSearch.resetSearchPaging,
    resetLeftSearchState: leftPaneSearch.resetSearchState,
    resetRightSearchPaging: rightPaneSearch.resetSearchPaging,
    resetRightSearchState: rightPaneSearch.resetSearchState,
    rightMatchIndex: rightPaneSearch.matchIndex,
    rightMatches: rightPaneSearch.matches,
    rightSearchHasMore: rightPaneSearch.searchHasMore,
    rightSearchNextOffset: rightPaneSearch.searchNextOffset,
    rightSearchOptions: rightPaneSearch.searchOptions,
    rightSearchTerm: rightPaneSearch.searchTerm,
    setIsLeftFindOpen: leftPaneSearch.setIsFindOpen,
    setIsLeftSearchLoadingMore: leftPaneSearch.setIsSearchLoadingMore,
    setIsRightFindOpen: rightPaneSearch.setIsFindOpen,
    setIsRightSearchLoadingMore: rightPaneSearch.setIsSearchLoadingMore,
    setLeftMatchIndex: leftPaneSearch.setMatchIndex,
    setLeftMatches: leftPaneSearch.setMatches,
    setLeftSearchHasMore: leftPaneSearch.setSearchHasMore,
    setLeftSearchNextOffset: leftPaneSearch.setSearchNextOffset,
    setLeftSearchOptions: leftPaneSearch.setSearchOptions,
    setLeftSearchTerm: leftPaneSearch.setSearchTerm,
    setRightMatchIndex: rightPaneSearch.setMatchIndex,
    setRightMatches: rightPaneSearch.setMatches,
    setRightSearchHasMore: rightPaneSearch.setSearchHasMore,
    setRightSearchNextOffset: rightPaneSearch.setSearchNextOffset,
    setRightSearchOptions: rightPaneSearch.setSearchOptions,
    setRightSearchTerm: rightPaneSearch.setSearchTerm,
  };
}
