import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { JsonSearchOptions, LargeJsonSearchMatch, Tab, TabDocumentMeta } from '../types/jsonTool';
import { getMonacoSearchBatch, getReplacementText } from '../utils/jsonEditorInteractions';

interface UseJsonPaneSearchActionsArgs {
  activeDocumentMeta: TabDocumentMeta;
  activeLeftMatchCount: number;
  activeRightMatchCount: number;
  activeTab: Tab | undefined;
  isBuildingDedicatedRightViewer: boolean;
  isLeftSearchLoadingMore: boolean;
  isRightSearchLoadingMore: boolean;
  leftEditorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  leftMatches: monaco.Range[];
  leftReplaceText: string;
  leftSearchHasMore: boolean;
  leftSearchNextOffset: number;
  leftSearchOptions: JsonSearchOptions;
  leftSearchTerm: string;
  normalizedLeftMatchIndex: number;
  replaceCurrentLeftText: (searchTerm: string, searchOptions: JsonSearchOptions, replacement: string) => void;
  replaceAllLeftText: (searchTerm: string, searchOptions: JsonSearchOptions, replacement: string) => void;
  requestWorkerSearch: (
    tabId: string,
    query: string,
    searchOptions: JsonSearchOptions,
    startOffset?: number,
    append?: boolean,
    target?: 'left' | 'right',
    text?: string,
    rawRevision?: number
  ) => void;
  resetLeftSearchPaging: () => void;
  resetRightSearchPaging: () => void;
  rightDecorationIdsRef: MutableRefObject<string[]>;
  rightEditorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  rightMatchIndex: number;
  rightMatches: monaco.Range[];
  rightSearchHasMore: boolean;
  rightSearchNextOffset: number;
  rightSearchOptions: JsonSearchOptions;
  rightSearchTerm: string;
  setIsLeftSearchLoadingMore: (loading: boolean) => void;
  setIsRightSearchLoadingMore: (loading: boolean) => void;
  setLargeViewerMatchCount: (count: number) => void;
  setLargeViewerMatches: Dispatch<SetStateAction<LargeJsonSearchMatch[]>>;
  setLeftMatchIndex: Dispatch<SetStateAction<number>>;
  setLeftSearchOptions: (value: JsonSearchOptions) => void;
  setLeftSearchTerm: (value: string) => void;
  setRightMatchIndex: Dispatch<SetStateAction<number>>;
  setRightMatches: Dispatch<SetStateAction<monaco.Range[]>>;
  setRightSearchHasMore: (hasMore: boolean) => void;
  setRightSearchNextOffset: (offset: number) => void;
  setRightSearchOptions: (value: JsonSearchOptions) => void;
  setRightSearchTerm: (value: string) => void;
  shouldUseDedicatedRightViewer: boolean;
}

export function useJsonPaneSearchActions({
  activeDocumentMeta,
  activeLeftMatchCount,
  activeRightMatchCount,
  activeTab,
  isBuildingDedicatedRightViewer,
  isLeftSearchLoadingMore,
  isRightSearchLoadingMore,
  leftEditorRef,
  leftMatches,
  leftReplaceText,
  leftSearchHasMore,
  leftSearchNextOffset,
  leftSearchOptions,
  leftSearchTerm,
  normalizedLeftMatchIndex,
  replaceCurrentLeftText,
  replaceAllLeftText,
  requestWorkerSearch,
  resetLeftSearchPaging,
  resetRightSearchPaging,
  rightDecorationIdsRef,
  rightEditorRef,
  rightMatchIndex,
  rightMatches,
  rightSearchHasMore,
  rightSearchNextOffset,
  rightSearchOptions,
  rightSearchTerm,
  setIsLeftSearchLoadingMore,
  setIsRightSearchLoadingMore,
  setLargeViewerMatchCount,
  setLargeViewerMatches,
  setLeftMatchIndex,
  setLeftSearchOptions,
  setLeftSearchTerm,
  setRightMatchIndex,
  setRightMatches,
  setRightSearchHasMore,
  setRightSearchNextOffset,
  setRightSearchOptions,
  setRightSearchTerm,
  shouldUseDedicatedRightViewer,
}: UseJsonPaneSearchActionsArgs) {
  const handleLeftSearchOptionsChange = (value: JsonSearchOptions) => {
    setLeftSearchOptions(value);
    resetLeftSearchPaging();
  };

  const handleRightSearchOptionsChange = (value: JsonSearchOptions) => {
    setRightSearchOptions(value);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    resetRightSearchPaging();
  };

  const replaceLeftMatch = () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const range = leftMatches[normalizedLeftMatchIndex];

    if (!editor || !model || !range) {
      if (leftSearchTerm && activeLeftMatchCount > 0) {
        replaceCurrentLeftText(leftSearchTerm, leftSearchOptions, leftReplaceText);
      }
      return;
    }

    editor.executeEdits('pane-find-replace', [
      {
        range,
        text: getReplacementText(model, range, leftSearchTerm, leftSearchOptions, leftReplaceText),
        forceMoveMarkers: true,
      },
    ]);
    editor.focus();
  };

  const replaceAllLeftMatches = () => {
    if (!leftSearchTerm || activeLeftMatchCount === 0) {
      return;
    }

    replaceAllLeftText(leftSearchTerm, leftSearchOptions, leftReplaceText);
  };

  const gotoNextLeft = () => {
    if (activeLeftMatchCount > 0) {
      setLeftMatchIndex((current) => (current + 1) % activeLeftMatchCount);
    }
  };

  const gotoPrevLeft = () => {
    if (activeLeftMatchCount > 0) {
      setLeftMatchIndex((current) => (current - 1 + activeLeftMatchCount) % activeLeftMatchCount);
    }
  };

  const gotoNextRight = () => {
    if (activeRightMatchCount > 0) {
      setRightMatchIndex((current) => (current + 1) % activeRightMatchCount);
    }
  };

  const gotoPrevRight = () => {
    if (activeRightMatchCount > 0) {
      setRightMatchIndex((current) => (current - 1 + activeRightMatchCount) % activeRightMatchCount);
    }
  };

  const loadMoreLeftSearch = () => {
    if (!activeTab || !leftSearchTerm || !leftSearchHasMore || isLeftSearchLoadingMore) {
      return;
    }

    setIsLeftSearchLoadingMore(true);
    requestWorkerSearch(
      activeTab.id,
      leftSearchTerm,
      leftSearchOptions,
      leftSearchNextOffset,
      true,
      'left',
      undefined,
      activeDocumentMeta.rawRevision
    );
  };

  const loadMoreRightSearch = () => {
    if (!rightSearchTerm || !rightSearchHasMore || isRightSearchLoadingMore) {
      return;
    }

    if (shouldUseDedicatedRightViewer) {
      if (activeTab) {
        setIsRightSearchLoadingMore(true);
        requestWorkerSearch(activeTab.id, rightSearchTerm, rightSearchOptions, rightSearchNextOffset, true);
      }
      return;
    }

    const editor = rightEditorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || isBuildingDedicatedRightViewer) {
      return;
    }

    const result = getMonacoSearchBatch(model, rightSearchTerm, rightSearchOptions, rightSearchNextOffset);
    const nextMatches = [...rightMatches, ...result.ranges];
    const activeIndex =
      nextMatches.length > 0 ? ((rightMatchIndex % nextMatches.length) + nextMatches.length) % nextMatches.length : 0;

    setRightMatches(nextMatches);
    setRightSearchHasMore(result.hasMore);
    setRightSearchNextOffset(result.nextStartOffset);
    rightDecorationIdsRef.current = editor.deltaDecorations(
      rightDecorationIdsRef.current,
      nextMatches.map((range, index) => ({
        range,
        options: {
          inlineClassName: index === activeIndex ? 'currentSearchHighlight' : 'searchHighlight',
        },
      }))
    );
  };

  const handleLeftSearchTermChange = (value: string) => {
    setLeftSearchTerm(value);
    resetLeftSearchPaging();
  };

  const handleRightSearchTermChange = (value: string) => {
    setRightSearchTerm(value);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    resetRightSearchPaging();
  };

  return {
    gotoNextLeft,
    gotoNextRight,
    gotoPrevLeft,
    gotoPrevRight,
    handleLeftSearchOptionsChange,
    handleLeftSearchTermChange,
    handleRightSearchOptionsChange,
    handleRightSearchTermChange,
    loadMoreLeftSearch,
    loadMoreRightSearch,
    replaceAllLeftMatches,
    replaceLeftMatch,
  };
}
