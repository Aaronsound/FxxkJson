import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import type { JsonSearchOptions } from '../types/jsonTool';
import { getMonacoSearchBatch } from '../utils/jsonEditorInteractions';
import {
  findSearchIndexAtOrAfterOffset,
  getRangeStartOffset,
  getSafeOffsetAt,
} from '../utils/searchMatchPosition';
import { getSearchDecorationWindow } from '../utils/searchDecorationWindow';

const EDIT_MODAL_SEARCH_DECORATION_RADIUS = 250;

interface UseEditModalSearchArgs {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  searchBatchSize: number;
}

export function useEditModalSearch({
  editorRef,
  searchBatchSize,
}: UseEditModalSearchArgs) {
  const searchDecorationIdsRef = useRef<string[]>([]);
  const searchAnchorOffsetRef = useRef<number | null>(null);
  const searchMatchesRef = useRef<monaco.Range[]>([]);
  const searchPreservePositionRef = useRef(false);
  const searchSkipRevealRef = useRef(false);
  const searchTermRef = useRef('');
  const normalizedSearchIndexRef = useRef(0);
  const isFindOpenRef = useRef(false);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOptions, setSearchOptions] = useState<JsonSearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [searchMatches, setSearchMatches] = useState<monaco.Range[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchNextOffset, setSearchNextOffset] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);

  const normalizedSearchIndex = searchMatches.length > 0
    ? ((searchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length
    : 0;

  useEffect(() => {
    searchMatchesRef.current = searchMatches;
    normalizedSearchIndexRef.current = normalizedSearchIndex;
  }, [normalizedSearchIndex, searchMatches]);

  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  useEffect(() => {
    isFindOpenRef.current = isFindOpen;
  }, [isFindOpen]);

  const resetSearchAnchor = useCallback(() => {
    searchAnchorOffsetRef.current = null;
    searchPreservePositionRef.current = false;
    searchSkipRevealRef.current = false;
  }, []);

  const clearSearchDecorations = useCallback(() => {
    if (editorRef.current && searchDecorationIdsRef.current.length > 0) {
      searchDecorationIdsRef.current = editorRef.current.deltaDecorations(
        searchDecorationIdsRef.current,
        []
      );
    }
  }, [editorRef]);

  const captureSearchAnchor = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    if (!isFindOpenRef.current || !searchTermRef.current) {
      resetSearchAnchor();
      return;
    }

    const model = editor.getModel();
    if (!model) {
      resetSearchAnchor();
      return;
    }

    const activeMatch = searchMatchesRef.current[normalizedSearchIndexRef.current];
    const fallbackPosition = editor.getPosition();
    searchAnchorOffsetRef.current = activeMatch
      ? getRangeStartOffset(model, activeMatch)
      : fallbackPosition
        ? getSafeOffsetAt(model, fallbackPosition)
        : null;
    searchPreservePositionRef.current = searchAnchorOffsetRef.current !== null;
    searchSkipRevealRef.current = searchPreservePositionRef.current;
  }, [resetSearchAnchor]);

  const closeFind = useCallback(() => {
    setIsFindOpen(false);
    setSearchTerm('');
    setSearchMatches([]);
    setSearchIndex(0);
    setSearchHasMore(false);
    setSearchNextOffset(0);
    resetSearchAnchor();
    clearSearchDecorations();
    editorRef.current?.focus();
  }, [clearSearchDecorations, editorRef, resetSearchAnchor]);

  const openFind = useCallback(() => {
    setIsFindOpen(true);
  }, []);

  const refreshSearch = useCallback(() => {
    setEditorRevision((current) => current + 1);
  }, []);

  const handleSearchOptionsChange = useCallback((value: JsonSearchOptions) => {
    resetSearchAnchor();
    setSearchOptions(value);
    setSearchIndex(0);
    setSearchHasMore(false);
    setSearchNextOffset(0);
  }, [resetSearchAnchor]);

  const handleSearchTermChange = useCallback((value: string) => {
    resetSearchAnchor();
    setSearchTerm(value);
    setSearchIndex(0);
    setSearchHasMore(false);
    setSearchNextOffset(0);
  }, [resetSearchAnchor]);

  const loadMoreSearch = useCallback(() => {
    if (!searchTerm || !searchHasMore) {
      return;
    }

    const model = editorRef.current?.getModel();
    if (!model) {
      return;
    }

    const result = getMonacoSearchBatch(
      model,
      searchTerm,
      searchOptions,
      searchNextOffset,
      searchBatchSize
    );
    setSearchMatches((current) => [...current, ...result.ranges]);
    setSearchHasMore(result.hasMore);
    setSearchNextOffset(result.nextStartOffset);
  }, [editorRef, searchBatchSize, searchHasMore, searchNextOffset, searchOptions, searchTerm]);

  const goToPreviousMatch = useCallback(() => {
    if (searchMatches.length > 0) {
      setSearchIndex((current) => (current - 1 + searchMatches.length) % searchMatches.length);
    }
  }, [searchMatches.length]);

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length > 0) {
      setSearchIndex((current) => (current + 1) % searchMatches.length);
    }
  }, [searchMatches.length]);

  useEffect(() => {
    if (!isFindOpen || !searchTerm) {
      setSearchMatches([]);
      setSearchIndex(0);
      setSearchHasMore(false);
      setSearchNextOffset(0);
      resetSearchAnchor();
      clearSearchDecorations();
      return;
    }

    const timerId = window.setTimeout(() => {
      const model = editorRef.current?.getModel();
      if (!model) {
        return;
      }

      const result = getMonacoSearchBatch(
        model,
        searchTerm,
        searchOptions,
        0,
        searchBatchSize
      );
      const nextSearchIndex = searchPreservePositionRef.current
        ? findSearchIndexAtOrAfterOffset(model, result.ranges, searchAnchorOffsetRef.current)
        : 0;

      setSearchMatches(result.ranges);
      setSearchIndex(nextSearchIndex);
      setSearchHasMore(result.hasMore);
      setSearchNextOffset(result.nextStartOffset);
      searchAnchorOffsetRef.current = null;
      searchPreservePositionRef.current = false;
    }, 80);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    clearSearchDecorations,
    editorRef,
    editorRevision,
    isFindOpen,
    resetSearchAnchor,
    searchBatchSize,
    searchOptions,
    searchTerm,
  ]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isFindOpen || !searchTerm) {
      clearSearchDecorations();
      return;
    }

    const visibleDecorationMatches = getSearchDecorationWindow(
      searchMatches,
      normalizedSearchIndex,
      EDIT_MODAL_SEARCH_DECORATION_RADIUS
    );
    const nextDecorations = visibleDecorationMatches.map(({ matchIndex, range }) => ({
      range,
      options: {
        inlineClassName:
          matchIndex === normalizedSearchIndex ? 'currentSearchHighlight' : 'searchHighlight',
      },
    }));

    searchDecorationIdsRef.current = editor.deltaDecorations(
      searchDecorationIdsRef.current,
      nextDecorations
    );

    const activeMatch = searchMatches[normalizedSearchIndex];
    if (!activeMatch) {
      searchSkipRevealRef.current = false;
      return;
    }

    if (searchSkipRevealRef.current) {
      searchSkipRevealRef.current = false;
      return;
    }

    editor.revealRangeInCenter(activeMatch);
    editor.setSelection(
      new monaco.Selection(
        activeMatch.startLineNumber,
        activeMatch.startColumn,
        activeMatch.endLineNumber,
        activeMatch.endColumn
      )
    );
  }, [
    clearSearchDecorations,
    editorRef,
    isFindOpen,
    normalizedSearchIndex,
    searchMatches,
    searchTerm,
  ]);

  useEffect(() => () => {
    clearSearchDecorations();
  }, [clearSearchDecorations]);

  return {
    captureSearchAnchor,
    closeFind,
    goToNextMatch,
    goToPreviousMatch,
    handleSearchOptionsChange,
    handleSearchTermChange,
    isFindOpen,
    isFindOpenRef,
    loadMoreSearch,
    normalizedSearchIndex,
    openFind,
    refreshSearch,
    searchHasMore,
    searchMatches,
    searchOptions,
    searchTerm,
  };
}
