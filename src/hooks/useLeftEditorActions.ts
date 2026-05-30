import type { OnMount } from '@monaco-editor/react';
import type { MutableRefObject } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { JsonSearchOptions, LargeJsonSearchMatch, Tab } from '../types/jsonTool';
import { DEFAULT_TAB_TITLE } from '../types/jsonTool';
import {
  bindEditorFocusContext,
  registerPaneFindAction,
  registerPasteContentTracking,
  registerSelectAllDeleteCommands,
} from '../utils/jsonEditorMountActions';
import { isLargeDocument } from '../utils/jsonDocumentMetrics';
import { selectionCoversModel } from '../utils/jsonToolModels';

interface UseLeftEditorActionsArgs {
  activeTab: Tab | null | undefined;
  activeTabIdRef: MutableRefObject<string>;
  beginPastePerformanceSession: (tabId: string, nextContent: string) => void;
  getTabContent: (tabId: string) => string;
  largeRawViewerMatches: LargeJsonSearchMatch[];
  leftEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  normalizedLeftMatchIndex: number;
  openLeftFind: () => void;
  queueFormat: (tabId: string, text: string, immediate?: boolean) => void;
  registerLeftEditorContextMenu: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  renameTab: (tabId: string, title: string) => void;
  requestReplaceText: (args: {
    tabId: string;
    text: string;
    searchTerm: string;
    searchOptions: JsonSearchOptions;
    replacement: string;
  }) => Promise<string>;
  resetSearchState: () => void;
  resetTabArtifacts: (tabId: string) => void;
  setTabError: (tabId: string, error: string | null) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  shouldUseDedicatedLeftViewer: boolean;
  suppressLeftChangeRef: MutableRefObject<Record<string, boolean>>;
  syncLeftModel: (tabId: string, content: string, forceValue?: boolean) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean) => void;
}

export function useLeftEditorActions({
  activeTab,
  activeTabIdRef,
  beginPastePerformanceSession,
  getTabContent,
  largeRawViewerMatches,
  leftEditorRef,
  normalizedLeftMatchIndex,
  openLeftFind,
  queueFormat,
  registerLeftEditorContextMenu,
  renameTab,
  requestReplaceText,
  resetSearchState,
  resetTabArtifacts,
  setTabError,
  setTabLargeMode,
  shouldUseDedicatedLeftViewer,
  suppressLeftChangeRef,
  syncLeftModel,
  updateTabContent,
}: UseLeftEditorActionsArgs) {
  const handleLeftMount: OnMount = (editor) => {
    leftEditorRef.current = editor;
    const currentTabId = activeTabIdRef.current;
    syncLeftModel(currentTabId, getTabContent(currentTabId), true);
    const leftEditorFocusContextKey = 'fxxkjsonLeftEditorFocused';

    editor.onDidDispose(() => {
      if (leftEditorRef.current === editor) {
        leftEditorRef.current = null;
      }
    });

    const clearSelectedDocument = () => {
      const currentTabId = activeTabIdRef.current;

      if (currentTabId) {
        renameTab(currentTabId, DEFAULT_TAB_TITLE);
        resetTabArtifacts(currentTabId);
        resetSearchState();
      }
    };

    bindEditorFocusContext(editor, leftEditorFocusContextKey);

    registerSelectAllDeleteCommands(monaco, editor, {
      focusContextKey: leftEditorFocusContextKey,
      onClearAll: clearSelectedDocument,
      selectionCoversModel: () => selectionCoversModel(editor),
    });

    registerPaneFindAction(monaco, editor, {
      actionId: 'openLeftPaneFind',
      label: '搜索原始 JSON',
      focusContextKey: leftEditorFocusContextKey,
      onOpen: openLeftFind,
    });

    registerPasteContentTracking(editor, {
      onPasteContent(nextContent) {
        const currentTabId = activeTabIdRef.current;
        if (currentTabId) {
          beginPastePerformanceSession(currentTabId, nextContent);
          queueFormat(currentTabId, nextContent);
        }
      },
    });

    registerLeftEditorContextMenu(editor);
  };

  const handleLeftChange = (value?: string) => {
    if (!activeTab) {
      return;
    }

    if (suppressLeftChangeRef.current[activeTab.id]) {
      return;
    }

    const nextContent = value ?? '';
    const largeMode = isLargeDocument(nextContent);
    updateTabContent(activeTab.id, nextContent);
    setTabLargeMode(activeTab.id, largeMode);
    queueFormat(activeTab.id, nextContent);
  };

  const replaceAllLeftText = async (searchTerm: string, searchOptions: JsonSearchOptions, replacement: string) => {
    if (!activeTab || !searchTerm) {
      return;
    }

    const currentTabId = activeTab.id;
    const currentText = getTabContent(currentTabId);

    try {
      const updated = await requestReplaceText({
        tabId: currentTabId,
        text: currentText,
        searchTerm,
        searchOptions,
        replacement,
      });

      if (updated === currentText || getTabContent(currentTabId) !== currentText) {
        return;
      }

      updateTabContent(currentTabId, updated, true);
      setTabLargeMode(currentTabId, isLargeDocument(updated));
      resetSearchState();
      queueFormat(currentTabId, updated);
    } catch (error) {
      setTabError(currentTabId, error instanceof Error ? `全部替换失败：${error.message}` : '全部替换失败');
    }
  };

  const replaceCurrentLargeLeftText = async (
    searchTerm: string,
    searchOptions: JsonSearchOptions,
    replacement: string
  ) => {
    if (!activeTab || !shouldUseDedicatedLeftViewer || !searchTerm) {
      return;
    }

    const currentMatch = largeRawViewerMatches[normalizedLeftMatchIndex];
    if (!currentMatch) {
      return;
    }

    const currentTabId = activeTab.id;
    const currentText = getTabContent(currentTabId);
    const matchedText = currentText.slice(currentMatch.start, currentMatch.end);

    try {
      const replacementText = await requestReplaceText({
        tabId: currentTabId,
        text: matchedText,
        searchTerm,
        searchOptions,
        replacement,
      });

      if (replacementText === matchedText || getTabContent(currentTabId) !== currentText) {
        return;
      }

      const updated = `${currentText.slice(0, currentMatch.start)}${replacementText}${currentText.slice(currentMatch.end)}`;
      updateTabContent(currentTabId, updated, true);
      setTabLargeMode(currentTabId, isLargeDocument(updated));
      queueFormat(currentTabId, updated);
    } catch (error) {
      setTabError(currentTabId, error instanceof Error ? `替换失败：${error.message}` : '替换失败');
    }
  };

  return {
    handleLeftChange,
    handleLeftMount,
    replaceAllLeftText,
    replaceCurrentLargeLeftText,
  };
}
