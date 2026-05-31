import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
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
  resetLeftSearchState: () => void;
  resetRightSearchState: () => void;
  resetSearchState: () => void;
  rightDecorationIdsRef: MutableRefObject<string[]>;
  rightEditorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  rightMatchIndex: number;
  rightSearchOptions: JsonSearchOptions;
  rightSearchTerm: string;
  setIsLeftFindOpen: (open: boolean) => void;
  setIsLeftSearchLoadingMore: (loading: boolean) => void;
  setIsRightFindOpen: (open: boolean) => void;
  setIsRightSearchLoadingMore: (loading: boolean) => void;
  setLargeRawViewerMatches: Dispatch<SetStateAction<LargeJsonSearchMatch[]>>;
  setLargeViewerMatchCount: (count: number) => void;
  setLargeViewerMatches: Dispatch<SetStateAction<LargeJsonSearchMatch[]>>;
  setLeftMatches: Dispatch<SetStateAction<monaco.Range[]>>;
  setLeftSearchHasMore: (hasMore: boolean) => void;
  setLeftSearchNextOffset: (offset: number) => void;
  setRightMatches: Dispatch<SetStateAction<monaco.Range[]>>;
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
  resetLeftSearchState,
  resetRightSearchState,
  resetSearchState,
  rightDecorationIdsRef,
  rightEditorRef,
  rightMatchIndex,
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
  useEffect(() => {
    resetSearchState();
  }, [activeTabId]);

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
  }, [
    activeDocumentMeta.formattedRevision,
    activeLargeViewerData,
    activeTab,
    rightSearchOptions,
    rightSearchTerm,
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
      rawRevision,
    });
    if (shouldSendRawText) {
      leftSearchWorkerRevisionRef.current[activeTab.id] = rawRevision;
    }
  }, [activeDocumentMeta.rawRevision, activeTab, leftSearchOptions, leftSearchTerm]);

  useEffect(() => {
    const editor = rightEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || !rightSearchTerm || shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer) {
      setRightMatches([]);
      if (!shouldUseDedicatedRightViewer) {
        setRightSearchHasMore(false);
        setRightSearchNextOffset(0);
        setIsRightSearchLoadingMore(false);
      }
      clearRightHighlights();
      return;
    }

    const result = getMonacoSearchBatch(model, rightSearchTerm, rightSearchOptions);
    const matches = result.ranges;
    setRightMatches(matches);
    setRightSearchHasMore(result.hasMore);
    setRightSearchNextOffset(result.nextStartOffset);
    setIsRightSearchLoadingMore(false);
    const activeIndex = matches.length > 0 ? ((rightMatchIndex % matches.length) + matches.length) % matches.length : 0;

    const nextDecorations = matches.map((range, index) => ({
      range,
      options: {
        inlineClassName: index === activeIndex ? 'currentSearchHighlight' : 'searchHighlight',
      },
    }));

    rightDecorationIdsRef.current = editor.deltaDecorations(rightDecorationIdsRef.current, nextDecorations);

    if (matches.length === 0) {
      return;
    }

    const activeMatch = matches[activeIndex];
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
    activeTabId,
    activeDocumentMeta.formattedRevision,
    isBuildingDedicatedRightViewer,
    rightMatchIndex,
    rightSearchOptions,
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
