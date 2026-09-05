import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { LargeJsonReadonlyViewerHandle } from '../components/LargeJsonReadonlyViewer';
import type { LargeRawReadonlyViewerHandle } from '../components/LargeRawReadonlyViewer';
import type {
  JsonSearchOptions,
  LargeJsonSearchMatch,
  Tab,
  TabDocumentMeta,
  WorkerSearchRequest,
} from '../types/jsonTool';
import { getMonacoSearchBatch } from '../utils/jsonEditorInteractions';
import type { createMonacoSearchCache } from '../utils/monacoSearchCache';

interface UseJsonToolSearchEffectsArgs {
  activeDocumentMeta: TabDocumentMeta;
  activeLargeViewerData: unknown;
  activeTab: Tab | undefined;
  activeTabId: string;
  clearLeftHighlights: () => void;
  clearRightHighlights: () => void;
  getTabContent: (tabId: string) => string;
  isBuildingDedicatedRightViewer: boolean;
  largeRawViewerRef: RefObject<LargeRawReadonlyViewerHandle | null>;
  largeViewerRef: RefObject<LargeJsonReadonlyViewerHandle | null>;
  leftEditorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  leftSearchOptions: JsonSearchOptions;
  leftSearchTerm: string;
  leftSearchWorkerRevisionRef: MutableRefObject<Record<string, number>>;
  rememberRightSearchTerm: (term: string) => void;
  requestWorkerSearch: (request: WorkerSearchRequest) => void;
  cancelWorkerSearch: (tabId: string, target: 'left' | 'right') => void;
  resetLeftSearchState: () => void;
  resetRightSearchState: () => void;
  resetSearchState: () => void;
  rightDecorationIdsRef: MutableRefObject<string[]>;
  rightEditorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  rightMatchIndex: number;
  rightMatches: monaco.IRange[];
  rightSearchCache: ReturnType<typeof createMonacoSearchCache>;
  rightSearchOptions: JsonSearchOptions;
  rightSearchTerm: string;
  setIsLeftFindOpen: (open: boolean) => void;
  setIsLeftSearchLoadingMore: (loading: boolean) => void;
  setIsRightFindOpen: (open: boolean) => void;
  setIsRightSearchLoadingMore: (loading: boolean) => void;
  setLargeRawViewerMatches: Dispatch<SetStateAction<LargeJsonSearchMatch[]>>;
  setLargeViewerMatchCount: (count: number) => void;
  setLargeViewerMatches: Dispatch<SetStateAction<LargeJsonSearchMatch[]>>;
  setLeftMatches: Dispatch<SetStateAction<monaco.IRange[]>>;
  setLeftSearchHasMore: (hasMore: boolean) => void;
  setLeftSearchNextOffset: (offset: number) => void;
  setRightMatches: Dispatch<SetStateAction<monaco.IRange[]>>;
  setRightSearchHasMore: (hasMore: boolean) => void;
  setRightSearchNextOffset: (offset: number) => void;
  shouldUseDedicatedLeftViewer: boolean;
  shouldUseDedicatedRightViewer: boolean;
}

export function useJsonToolSearchEffects({
  activeDocumentMeta,
  activeLargeViewerData,
  activeTab,
  activeTabId,
  clearLeftHighlights,
  clearRightHighlights,
  getTabContent,
  isBuildingDedicatedRightViewer,
  largeRawViewerRef,
  largeViewerRef,
  leftEditorRef,
  leftSearchOptions,
  leftSearchTerm,
  leftSearchWorkerRevisionRef,
  rememberRightSearchTerm,
  requestWorkerSearch,
  cancelWorkerSearch,
  resetLeftSearchState,
  resetRightSearchState,
  resetSearchState,
  rightDecorationIdsRef,
  rightEditorRef,
  rightMatchIndex,
  rightMatches,
  rightSearchCache,
  rightSearchOptions,
  rightSearchTerm,
  setIsLeftFindOpen,
  setIsLeftSearchLoadingMore,
  setIsRightFindOpen,
  setIsRightSearchLoadingMore,
  setLargeRawViewerMatches,
  setLargeViewerMatchCount,
  setLargeViewerMatches,
  setLeftMatches,
  setLeftSearchHasMore,
  setLeftSearchNextOffset,
  setRightMatches,
  setRightSearchHasMore,
  setRightSearchNextOffset,
  shouldUseDedicatedLeftViewer,
  shouldUseDedicatedRightViewer,
}: UseJsonToolSearchEffectsArgs) {
  const decoratedSearch = useRef<{
    editor: monaco.editor.IStandaloneCodeEditor;
    matches: monaco.IRange[];
    activeIndex: number;
  } | null>(null);
  useEffect(() => {
    void activeTabId;
    resetSearchState();
  }, [activeTabId, resetSearchState]);

  useEffect(() => {
    if (!rightSearchTerm.trim()) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      rememberRightSearchTerm(rightSearchTerm);
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [rememberRightSearchTerm, rightSearchTerm]);

  useEffect(() => {
    void activeDocumentMeta.formattedRevision;
    void activeLargeViewerData;
    if (!activeTab || !shouldUseDedicatedRightViewer) {
      setLargeViewerMatches([]);
      setLargeViewerMatchCount(0);
      setRightSearchHasMore(false);
      setRightSearchNextOffset(0);
      setIsRightSearchLoadingMore(false);
      return;
    }

    if (!rightSearchTerm) {
      setLargeViewerMatches([]);
      setLargeViewerMatchCount(0);
      setRightSearchHasMore(false);
      setRightSearchNextOffset(0);
      setIsRightSearchLoadingMore(false);
      return;
    }

    setIsRightSearchLoadingMore(false);
    requestWorkerSearch({
      tabId: activeTab.id,
      query: rightSearchTerm,
      searchOptions: rightSearchOptions,
    });
    return () => cancelWorkerSearch(activeTab.id, 'right');
  }, [
    activeDocumentMeta.formattedRevision,
    activeLargeViewerData,
    activeTab,
    requestWorkerSearch,
    cancelWorkerSearch,
    rightSearchOptions,
    rightSearchTerm,
    setIsRightSearchLoadingMore,
    setLargeViewerMatchCount,
    setLargeViewerMatches,
    setRightSearchHasMore,
    setRightSearchNextOffset,
    shouldUseDedicatedRightViewer,
  ]);

  useEffect(() => {
    if (!activeTab || !leftSearchTerm) {
      setLeftMatches([]);
      setLargeRawViewerMatches([]);
      setLeftSearchHasMore(false);
      setLeftSearchNextOffset(0);
      setIsLeftSearchLoadingMore(false);
      clearLeftHighlights();
      return;
    }

    setIsLeftSearchLoadingMore(false);
    const rawRevision = activeDocumentMeta.rawRevision;
    const shouldSendRawText = leftSearchWorkerRevisionRef.current[activeTab.id] !== rawRevision;

    requestWorkerSearch({
      tabId: activeTab.id,
      query: leftSearchTerm,
      searchOptions: leftSearchOptions,
      target: 'left',
      text: shouldSendRawText ? getTabContent(activeTab.id) : undefined,
      textByteLength: shouldSendRawText ? activeDocumentMeta.rawLength : undefined,
      rawRevision,
    });
    if (shouldSendRawText) {
      leftSearchWorkerRevisionRef.current[activeTab.id] = rawRevision;
    }
    return () => cancelWorkerSearch(activeTab.id, 'left');
  }, [
    activeDocumentMeta.rawLength,
    activeDocumentMeta.rawRevision,
    activeTab,
    clearLeftHighlights,
    getTabContent,
    leftSearchOptions,
    leftSearchTerm,
    leftSearchWorkerRevisionRef,
    requestWorkerSearch,
    cancelWorkerSearch,
    setIsLeftSearchLoadingMore,
    setLargeRawViewerMatches,
    setLeftMatches,
    setLeftSearchHasMore,
    setLeftSearchNextOffset,
  ]);

  useEffect(() => {
    void activeTabId;
    void activeDocumentMeta.formattedRevision;
    const editor = rightEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || !rightSearchTerm || shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer) {
      rightSearchCache.clear();
      setRightMatches([]);
      if (!shouldUseDedicatedRightViewer) {
        setRightSearchHasMore(false);
        setRightSearchNextOffset(0);
        setIsRightSearchLoadingMore(false);
      }
      clearRightHighlights();
      return;
    }

    const result = getMonacoSearchBatch(
      model,
      rightSearchTerm,
      rightSearchOptions,
      0,
      undefined,
      rightSearchCache.get(model)
    );
    const matches = result.ranges;
    setRightMatches(matches);
    setRightSearchHasMore(result.hasMore);
    setRightSearchNextOffset(result.nextStartOffset);
    setIsRightSearchLoadingMore(false);
  }, [
    activeTabId,
    activeDocumentMeta.formattedRevision,
    clearRightHighlights,
    isBuildingDedicatedRightViewer,
    rightEditorRef,
    rightSearchCache,
    rightSearchOptions,
    rightSearchTerm,
    setIsRightSearchLoadingMore,
    setRightMatches,
    setRightSearchHasMore,
    setRightSearchNextOffset,
    shouldUseDedicatedRightViewer,
  ]);

  useEffect(() => () => rightSearchCache.clear(), [rightSearchCache]);

  useEffect(() => {
    const editor = rightEditorRef.current;
    if (!editor || !rightSearchTerm || shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer) {
      decoratedSearch.current = null;
      return;
    }
    const matches = rightMatches;
    const activeIndex = matches.length > 0 ? ((rightMatchIndex % matches.length) + matches.length) % matches.length : 0;

    const previous = decoratedSearch.current;
    const decoration = (index: number) => ({
      range: matches[index],
      options: { inlineClassName: index === activeIndex ? 'currentSearchHighlight' : 'searchHighlight' },
    });
    if (
      previous?.editor === editor &&
      previous.matches === matches &&
      rightDecorationIdsRef.current.length === matches.length
    ) {
      if (matches.length && previous.activeIndex !== activeIndex) {
        const indices = [previous.activeIndex, activeIndex];
        const ids = editor.deltaDecorations(
          indices.map((index) => rightDecorationIdsRef.current[index]),
          indices.map(decoration)
        );
        indices.forEach((index, i) => {
          rightDecorationIdsRef.current[index] = ids[i];
        });
      }
    } else {
      rightDecorationIdsRef.current = editor.deltaDecorations(
        rightDecorationIdsRef.current,
        matches.map((_, index) => decoration(index))
      );
    }
    decoratedSearch.current = { editor, matches, activeIndex };

    if (matches.length === 0) {
      return;
    }

    const activeMatch = matches[activeIndex];
    editor.revealRangeInCenter(activeMatch);
    editor.setSelection(activeMatch);
  }, [
    isBuildingDedicatedRightViewer,
    rightDecorationIdsRef,
    rightEditorRef,
    rightMatchIndex,
    rightMatches,
    rightSearchTerm,
    shouldUseDedicatedRightViewer,
  ]);

  const openLeftFind = useCallback(() => {
    setIsLeftFindOpen(true);
  }, [setIsLeftFindOpen]);

  const openRightFind = useCallback(() => {
    setIsRightFindOpen(true);
  }, [setIsRightFindOpen]);

  const closeLeftFind = useCallback(() => {
    resetLeftSearchState();
    clearLeftHighlights();
    if (shouldUseDedicatedLeftViewer) {
      largeRawViewerRef.current?.focus();
    } else {
      leftEditorRef.current?.focus();
    }
  }, [clearLeftHighlights, largeRawViewerRef, leftEditorRef, resetLeftSearchState, shouldUseDedicatedLeftViewer]);

  const closeRightFind = useCallback(() => {
    resetRightSearchState();
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    clearRightHighlights();
    if (shouldUseDedicatedRightViewer) {
      largeViewerRef.current?.focus();
    } else {
      rightEditorRef.current?.focus();
    }
  }, [
    clearRightHighlights,
    largeViewerRef,
    resetRightSearchState,
    rightEditorRef,
    setLargeViewerMatchCount,
    setLargeViewerMatches,
    shouldUseDedicatedRightViewer,
  ]);

  return {
    closeLeftFind,
    closeRightFind,
    openLeftFind,
    openRightFind,
  };
}
