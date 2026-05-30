import { MutableRefObject } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api';
import type { LargeJsonReadonlyViewerHandle } from '../components/LargeJsonReadonlyViewer';
import type { RightNodeSelection, Tab } from '../types/jsonTool';
import { findNearestFoldableLine } from '../utils/foldableLine';

interface UseRightPaneNavigationActionsArgs {
  activeRightNodeSelection: RightNodeSelection | null;
  activeTab: Tab | undefined;
  activeTabIdRef: MutableRefObject<string>;
  getPinnedPath: (
    tabId: string,
    id: string
  ) => { endOffset: number; pathText: string; startOffset: number } | null | undefined;
  largeViewerRef: MutableRefObject<LargeJsonReadonlyViewerHandle | null>;
  pinRightPath: (tabId: string, selection: RightNodeSelection | null) => void;
  requestWorkerLocate: (tabId: string, offset: number) => void;
  rightEditorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>;
  setRightNodeSelection: (tabId: string, selection: RightNodeSelection | null) => void;
  shouldUseDedicatedRightViewer: boolean;
}

export function useRightPaneNavigationActions({
  activeRightNodeSelection,
  activeTab,
  activeTabIdRef,
  getPinnedPath,
  largeViewerRef,
  pinRightPath,
  requestWorkerLocate,
  rightEditorRef,
  setRightNodeSelection,
  shouldUseDedicatedRightViewer,
}: UseRightPaneNavigationActionsArgs) {
  const revealRightOffset = (offset: number, endOffset = offset + 1) => {
    if (shouldUseDedicatedRightViewer) {
      largeViewerRef.current?.revealOffset(offset);
      return;
    }

    const editor = rightEditorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return;
    }

    const start = model.getPositionAt(Math.max(0, offset));
    const end = model.getPositionAt(Math.max(offset + 1, endOffset));
    const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
    editor.revealRangeInCenter(range);
    editor.setSelection(range);
    editor.focus();
  };

  const pinActiveRightPath = () => {
    if (!activeTab) {
      return;
    }

    pinRightPath(activeTab.id, activeRightNodeSelection);
  };

  const selectRightPinnedPath = (id: string) => {
    if (!activeTab) {
      return;
    }

    const pinnedPath = getPinnedPath(activeTab.id, id);
    if (!pinnedPath) {
      return;
    }

    setRightNodeSelection(activeTab.id, {
      path: null,
      pathText: pinnedPath.pathText,
      startOffset: pinnedPath.startOffset,
      endOffset: pinnedPath.endOffset,
      updatedAt: Date.now(),
    });
    revealRightOffset(pinnedPath.startOffset, pinnedPath.endOffset);
    requestWorkerLocate(activeTab.id, pinnedPath.startOffset);
  };

  const toggleRightFoldAtOffset = (tabId: string, offset: number) => {
    if (tabId !== activeTabIdRef.current) {
      return;
    }

    const editor = rightEditorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return;
    }

    const position = model.getPositionAt(offset);
    const foldLine = findNearestFoldableLine(model, position.lineNumber);
    const targetPosition = foldLine ? { lineNumber: foldLine, column: 1 } : position;
    editor.setPosition(targetPosition);
    editor.focus();
    void editor.getAction('editor.toggleFold')?.run();
  };

  return {
    pinActiveRightPath,
    revealRightOffset,
    selectRightPinnedPath,
    toggleRightFoldAtOffset,
  };
}
