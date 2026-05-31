import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import { SEARCH_HIGHLIGHT_DURATION } from '../types/jsonTool';
import type { LargeRawReadonlyViewerHandle } from '../components/LargeRawReadonlyViewer';

interface UseLeftPaneSearchResultsArgs {
  activeTabId: string;
  activeTabIdRef: MutableRefObject<string>;
  largeRawViewerRef: RefObject<LargeRawReadonlyViewerHandle | null>;
  leftEditorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  leftMatches: monaco.Range[];
  leftMatchIndex: number;
  leftSearchTerm: string;
  setIsLeftSearchLoadingMore: (loading: boolean) => void;
  setLeftMatches: Dispatch<SetStateAction<monaco.Range[]>>;
  setLeftSearchHasMore: (hasMore: boolean) => void;
  setLeftSearchNextOffset: (offset: number) => void;
  shouldUseDedicatedLeftViewer: boolean;
}

export function useLeftPaneSearchResults({
  activeTabId,
  activeTabIdRef,
  largeRawViewerRef,
  leftEditorRef,
  leftMatches,
  leftMatchIndex,
  leftSearchTerm,
  setIsLeftSearchLoadingMore,
  setLeftMatches,
  setLeftSearchHasMore,
  setLeftSearchNextOffset,
  shouldUseDedicatedLeftViewer,
}: UseLeftPaneSearchResultsArgs) {
  const [leftRawHighlightRange, setLeftRawHighlightRange] = useState<{ start: number; end: number } | null>(null);
  const [largeRawViewerMatches, setLargeRawViewerMatches] = useState<LargeJsonSearchMatch[]>([]);
  const leftDecorationIdsRef = useRef<string[]>([]);
  const highlightTimeoutRef = useRef<number | null>(null);
  const activeLeftMatchCount = shouldUseDedicatedLeftViewer ? largeRawViewerMatches.length : leftMatches.length;
  const normalizedLeftMatchIndex =
    activeLeftMatchCount > 0
      ? ((leftMatchIndex % activeLeftMatchCount) + activeLeftMatchCount) % activeLeftMatchCount
      : 0;

  const clearLeftHighlights = () => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    setLeftRawHighlightRange(null);

    if (leftEditorRef.current && leftDecorationIdsRef.current.length > 0) {
      leftEditorRef.current.deltaDecorations(leftDecorationIdsRef.current, []);
      leftDecorationIdsRef.current = [];
    }
  };

  const revealLeftRange = (startOffset: number, endOffset: number) => {
    if (shouldUseDedicatedLeftViewer) {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      setLeftRawHighlightRange({ start: startOffset, end: endOffset });
      largeRawViewerRef.current?.revealRange(startOffset, endOffset);
      highlightTimeoutRef.current = window.setTimeout(clearLeftHighlights, SEARCH_HIGHLIGHT_DURATION);
      return;
    }

    const leftEditor = leftEditorRef.current;
    const leftModel = leftEditor?.getModel();
    if (!leftEditor || !leftModel) {
      return;
    }

    const start = leftModel.getPositionAt(startOffset);
    const end = leftModel.getPositionAt(endOffset);
    const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);

    leftEditor.revealRangeInCenter(range);
    leftEditor.setSelection(new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column));
    leftDecorationIdsRef.current = leftEditor.deltaDecorations(leftDecorationIdsRef.current, [
      {
        range,
        options: { inlineClassName: 'currentSearchHighlight' },
      },
    ]);

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(clearLeftHighlights, SEARCH_HIGHLIGHT_DURATION);
  };

  const setLeftSearchResults = (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore = false,
    nextStartOffset = 0,
    append = false
  ) => {
    if (tabId !== activeTabIdRef.current) {
      return;
    }

    setIsLeftSearchLoadingMore(false);
    const model = leftEditorRef.current?.getModel();

    if (!model) {
      setLargeRawViewerMatches((current) => (append ? [...current, ...matches] : matches));
      setLeftSearchHasMore(hasMore);
      setLeftSearchNextOffset(nextStartOffset);
      return;
    }

    const ranges = matches.map((match) => {
      const start = model.getPositionAt(match.start);
      const end = model.getPositionAt(match.end);
      return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
    });

    setLeftMatches((current) => (append ? [...current, ...ranges] : ranges));
    setLargeRawViewerMatches([]);
    setLeftSearchHasMore(hasMore);
    setLeftSearchNextOffset(nextStartOffset);
  };

  useEffect(() => {
    if (!shouldUseDedicatedLeftViewer || !leftSearchTerm) {
      return;
    }

    if (largeRawViewerMatches.length === 0) {
      clearLeftHighlights();
      return;
    }

    const activeMatch = largeRawViewerMatches[normalizedLeftMatchIndex];
    if (activeMatch) {
      setLeftRawHighlightRange({ start: activeMatch.start, end: activeMatch.end });
      largeRawViewerRef.current?.revealRange(activeMatch.start, activeMatch.end);
    }
  }, [
    activeTabId,
    largeRawViewerMatches,
    leftMatchIndex,
    leftSearchTerm,
    normalizedLeftMatchIndex,
    shouldUseDedicatedLeftViewer,
  ]);

  useEffect(() => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();

    if (shouldUseDedicatedLeftViewer || !editor || !model || !leftSearchTerm) {
      clearLeftHighlights();
      return;
    }

    const activeIndex =
      leftMatches.length > 0 ? ((leftMatchIndex % leftMatches.length) + leftMatches.length) % leftMatches.length : 0;
    const nextDecorations = leftMatches.map((range, index) => ({
      range,
      options: {
        inlineClassName: index === activeIndex ? 'currentSearchHighlight' : 'searchHighlight',
      },
    }));

    leftDecorationIdsRef.current = editor.deltaDecorations(leftDecorationIdsRef.current, nextDecorations);
    if (leftMatches.length === 0) {
      return;
    }

    const activeMatch = leftMatches[activeIndex];
    editor.revealRangeInCenter(activeMatch);
    editor.setSelection(
      new monaco.Selection(
        activeMatch.startLineNumber,
        activeMatch.startColumn,
        activeMatch.endLineNumber,
        activeMatch.endColumn
      )
    );
  }, [activeTabId, leftMatches, leftMatchIndex, leftSearchTerm, shouldUseDedicatedLeftViewer]);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    },
    []
  );

  return {
    activeLeftMatchCount,
    clearLeftHighlights,
    largeRawViewerMatches,
    leftRawHighlightRange,
    normalizedLeftMatchIndex,
    revealLeftRange,
    setLargeRawViewerMatches,
    setLeftSearchResults,
  };
}
