import React, { useEffect, useState } from 'react';
import { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import JsonEditorPanes from './components/JsonEditorPanes';
import JsonPerformancePanel from './components/JsonPerformancePanel';
import JsonToolTabBar from './components/JsonToolTabBar';
import JsonToolToolbar from './components/JsonToolToolbar';
import JsonToolContextMenus from './components/JsonToolContextMenus';
import JsonToolOverlayLayer from './components/JsonToolOverlayLayer';
import { useLeftEditorContextMenu } from './hooks/useLeftEditorContextMenu';
import { useJsonToolContentActions } from './hooks/useJsonToolContentActions';
import { useJsonToolDialogs } from './hooks/useJsonToolDialogs';
import { useJsonToolRefs, usePreserveActiveTabViewState } from './hooks/useJsonToolRefs';
import { useJsonToolTabActions } from './hooks/useJsonToolTabActions';
import { useJsonEditSession } from './hooks/useJsonEditSession';
import { useJsonFormattingWorker } from './hooks/useJsonFormattingWorker';
import { useJsonPerformanceTracking } from './hooks/useJsonPerformanceTracking';
import { useRightNodeSelectionHighlight } from './hooks/useRightNodeSelectionHighlight';
import { useJsonToolTabsState } from './hooks/useJsonToolTabsState';
import { useJsonTabArtifacts } from './hooks/useJsonTabArtifacts';
import { usePaneSearchState } from './hooks/usePaneSearchState';
import { useJsonEditorModelSync } from './hooks/useJsonEditorModelSync';
import { useJsonImportActions } from './hooks/useJsonImportActions';
import { useJsonImportDropZone } from './hooks/useJsonImportDropZone';
import { useJsonPaneSearchActions } from './hooks/useJsonPaneSearchActions';
import { useLeftPaneSearchResults } from './hooks/useLeftPaneSearchResults';
import { useActiveJsonTabState } from './hooks/useActiveJsonTabState';
import { useJsonToolPreferences } from './hooks/useJsonToolPreferences';
import { useContextualFindShortcut } from './hooks/useContextualFindShortcut';
import { useE2eTestBridge } from './hooks/useE2eTestBridge';
import { useRightEditorActions } from './hooks/useRightEditorActions';
import { useRightEditorContextMenuState } from './hooks/useRightEditorContextMenuState';
import { useRightNodeActions } from './hooks/useRightNodeActions';
import { useRightNodeEditOpeners } from './hooks/useRightNodeEditOpeners';
import { useRightNodeMutationDialog } from './hooks/useRightNodeMutationDialog';
import { useRightSearchQuickAccess } from './hooks/useRightSearchQuickAccess';
import { useRightPaneNavigationActions } from './hooks/useRightPaneNavigationActions';
import { useJsonToolDerivedState } from './hooks/useJsonToolDerivedState';
import { useJsonToolStateSetters } from './hooks/useJsonToolStateSetters';
import { useJsonToolSearchEffects } from './hooks/useJsonToolSearchEffects';
import { DEFAULT_TAB_TITLE, INITIAL_TAB_ID, STRUCTURE_SYNC_THRESHOLD } from './types/jsonTool';
import type { EditJsonWorkerOperation, LargeJsonSearchMatch } from './types/jsonTool';
import { selectionCoversModel } from './utils/jsonToolModels';
import {
  bindEditorFocusContext,
  registerPaneFindAction,
  registerPasteContentTracking,
  registerSelectAllDeleteCommands,
} from './utils/jsonEditorMountActions';
import { getUtf8ByteLength, isLargeDocument } from './utils/jsonDocumentMetrics';
import { getMonacoOptions } from './utils/jsonEditorInteractions';
import { writeTextToClipboard } from './utils/clipboard';
import { APP_VERSION } from './utils/appInfo';
import { logDiagnosticsToConsole } from './utils/diagnosticsLogger';
import './App.css';

const App: React.FC = () => {
  const {
    activeTabId,
    cancelRenaming,
    documentMetaByTab,
    errorsByTab,
    finishRenaming,
    handleRenamingChange,
    importingByTab,
    initializeTabState,
    isFormattingByTab,
    largeFileLocateEnabledByTab,
    largeModeByTab,
    removeTabState,
    renameTab,
    renamingTab,
    setActiveTabId,
    setDocumentMeta,
    setTabError,
    setTabFormatting,
    setTabImporting,
    setTabLargeModeState,
    setLargeFileLocateEnabledState,
    setStructureStatusState,
    setTabs,
    startRenamingTab,
    structureStatusByTab,
    tabs,
  } = useJsonToolTabsState({
    initialTabId: INITIAL_TAB_ID,
    initialTabTitle: 'HelloJson',
  });
  const leftPaneSearch = usePaneSearchState();
  const rightPaneSearch = usePaneSearchState();
  const {
    isFindOpen: isLeftFindOpen,
    isSearchLoadingMore: isLeftSearchLoadingMore,
    matchIndex: leftMatchIndex,
    matches: leftMatches,
    resetSearchPaging: resetLeftSearchPaging,
    resetSearchState: resetLeftSearchState,
    searchHasMore: leftSearchHasMore,
    searchNextOffset: leftSearchNextOffset,
    searchOptions: leftSearchOptions,
    searchTerm: leftSearchTerm,
    setIsFindOpen: setIsLeftFindOpen,
    setIsSearchLoadingMore: setIsLeftSearchLoadingMore,
    setMatchIndex: setLeftMatchIndex,
    setMatches: setLeftMatches,
    setSearchHasMore: setLeftSearchHasMore,
    setSearchNextOffset: setLeftSearchNextOffset,
    setSearchOptions: setLeftSearchOptions,
    setSearchTerm: setLeftSearchTerm,
  } = leftPaneSearch;
  const {
    isFindOpen: isRightFindOpen,
    isSearchLoadingMore: isRightSearchLoadingMore,
    matchIndex: rightMatchIndex,
    matches: rightMatches,
    resetSearchPaging: resetRightSearchPaging,
    resetSearchState: resetRightSearchState,
    searchHasMore: rightSearchHasMore,
    searchNextOffset: rightSearchNextOffset,
    searchOptions: rightSearchOptions,
    searchTerm: rightSearchTerm,
    setIsFindOpen: setIsRightFindOpen,
    setIsSearchLoadingMore: setIsRightSearchLoadingMore,
    setMatchIndex: setRightMatchIndex,
    setMatches: setRightMatches,
    setSearchHasMore: setRightSearchHasMore,
    setSearchNextOffset: setRightSearchNextOffset,
    setSearchOptions: setRightSearchOptions,
    setSearchTerm: setRightSearchTerm,
  } = rightPaneSearch;
  const [leftReplaceText, setLeftReplaceText] = useState('');
  const [largeViewerMatchCount, setLargeViewerMatchCount] = useState(0);
  const [largeViewerMatches, setLargeViewerMatches] = useState<LargeJsonSearchMatch[]>([]);
  const {
    isDarkMode,
    language,
    setIsDarkMode,
    setLanguage,
    setShowPerformancePanel,
    setWrapLongLines,
    showPerformancePanel,
    t,
    wrapLongLines,
  } = useJsonToolPreferences();
  const {
    isAboutOpen,
    isArchitectureWarningDismissed,
    isCompareOpen,
    isDiagnosticsLogOpen,
    runtimeInfo,
    setIsAboutOpen,
    setIsArchitectureWarningDismissed,
    setIsCompareOpen,
    setIsDiagnosticsLogOpen,
  } = useJsonToolDialogs();
  const {
    initializeTabArtifacts,
    largeRawViewerDataByTab,
    largeViewerCollapsedLinesByTab,
    largeViewerDataByTab,
    largeViewerStatusByTab,
    locateFeedbackByTab,
    processingStageByTab,
    removeTabArtifactsState,
    rightNodeSelectionByTab,
    setLargeRawViewerDataByTab,
    setLargeViewerCollapsedLinesByTab,
    setLargeViewerDataByTab,
    setLargeViewerStatusByTab,
    setLocateFeedbackByTab,
    setProcessingStageByTab,
    setRightNodeSelectionByTab,
  } = useJsonTabArtifacts(INITIAL_TAB_ID);

  const {
    activeTabIdRef,
    fileInputRef,
    formattedTextByTabRef,
    largeFileLocateEnabledRef,
    largeModeRef,
    largeRawViewerRef,
    largeViewerRef,
    leftEditorRef,
    leftSearchWorkerRevisionRef,
    leftViewStateByTabRef,
    previousActiveTabIdRef,
    rawTextByTabRef,
    rightContextMenuOffsetByTabRef,
    rightDecorationIdsRef,
    rightEditorRef,
    rightViewStateByTabRef,
    structureStatusRef,
    suppressLeftChangeRef,
    workerStructureEnabledRef,
  } = useJsonToolRefs(INITIAL_TAB_ID);
  const {
    beginPerformanceSession,
    clearPerformanceState,
    logEvent,
    mutatePerformanceSession,
    performanceByTab,
    performanceHistory,
    performanceSessionsRef,
    setPerformanceByTab,
    syncPerformanceSnapshot,
  } = useJsonPerformanceTracking({
    activeTabIdRef,
    initialTabId: INITIAL_TAB_ID,
  });
  const {
    closeEditJson,
    editJsonBusyLabel,
    editJsonError,
    editJsonSession,
    editJsonValueRef,
    hasCopiedLiteral,
    openDocumentEditSession,
    openNodeEditSession,
    setEditJsonBusyLabel,
    setEditJsonError,
    showCopyLiteralNotice,
  } = useJsonEditSession();
  const {
    cancelMutationDialog,
    confirmDeleteDialog,
    confirmRenameDialog,
    dialogState: rightNodeMutationDialog,
    requestDeleteNode,
    requestRenameKey,
  } = useRightNodeMutationDialog();

  const {
    activeDocumentMeta,
    activeLargeRawViewerData,
    activeLargeViewerCollapsedLines,
    activeLargeViewerData,
    activeLargeViewerStatus,
    activeLocateFeedback,
    activePerformanceSnapshot,
    activeProcessingStage,
    activeRawText,
    activeRightNodeSelection,
    activeRightSelectedRange,
    activeTab,
    canEditJson,
    canEnableLargeFileLocate,
    canUseRightPaneFolding,
    currentError,
    currentStructureStatus,
    formattedValue,
    importingFileName,
    isBuildingDedicatedRightViewer,
    isFormattingActiveTab,
    isImportingActiveTab,
    isLargeFileLocateEnabled,
    isLargeFileMode,
    shouldEnableRightPaneFolding,
    shouldUseDedicatedLeftViewer,
    shouldUseDedicatedRightViewer,
    usesLightweightLocate,
  } = useActiveJsonTabState({
    activeTabId,
    documentMetaByTab,
    errorsByTab,
    formattedTextByTab: formattedTextByTabRef.current,
    importingByTab,
    isFormattingByTab,
    largeFileLocateEnabledByTab,
    largeModeByTab,
    largeRawViewerDataByTab,
    largeViewerCollapsedLinesByTab,
    largeViewerDataByTab,
    largeViewerStatusByTab,
    locateFeedbackByTab,
    performanceByTab,
    processingStageByTab,
    rawTextByTab: rawTextByTabRef.current,
    rightNodeSelectionByTab,
    structureStatusByTab,
    tabs,
  });
  const { activeRightPinnedPathItems, getPinnedPath, pinRightPath, rememberRightSearchTerm, rightRecentSearches } =
    useRightSearchQuickAccess(activeTab?.id ?? null);
  const { rightEditorContextMenu, setRightEditorContextMenu } = useRightEditorContextMenuState(
    activeTabId,
    shouldUseDedicatedRightViewer
  );
  const canControlRightPaneFolding = Boolean(
    formattedValue && !isBuildingDedicatedRightViewer && (canUseRightPaneFolding || shouldUseDedicatedRightViewer)
  );
  const activeRightMatchCount = shouldUseDedicatedRightViewer ? largeViewerMatchCount : rightMatches.length;
  const {
    activeLeftMatchCount,
    clearLeftHighlights,
    largeRawViewerMatches,
    leftRawHighlightRange,
    normalizedLeftMatchIndex,
    revealLeftRange,
    setLargeRawViewerMatches,
    setLeftSearchResults,
  } = useLeftPaneSearchResults({
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
  });
  const { diagnosticsContext, leftPaneMetaText, normalizedRightMatchIndex, processingStageText, rightPaneMetaText } =
    useJsonToolDerivedState({
      activeDocumentMeta,
      activeLeftMatchCount,
      activeLocateFeedback,
      activePerformanceSnapshot,
      activeProcessingStage,
      activeRightMatchCount,
      activeRightNodeSelection,
      activeTab,
      canEnableLargeFileLocate,
      canUseRightPaneFolding,
      currentError,
      currentStructureStatus,
      importingFileName,
      isFormattingActiveTab,
      isLargeFileLocateEnabled,
      isLargeFileMode,
      leftSearchHasMore,
      leftSearchTerm,
      normalizedLeftMatchIndex,
      rightMatchIndex,
      rightSearchHasMore,
      rightSearchTerm,
      shouldUseDedicatedLeftViewer,
      shouldUseDedicatedRightViewer,
      usesLightweightLocate,
    });

  const clearRightHighlights = () => {
    if (rightEditorRef.current && rightDecorationIdsRef.current.length > 0) {
      rightEditorRef.current.deltaDecorations(rightDecorationIdsRef.current, []);
      rightDecorationIdsRef.current = [];
    }
  };

  const logRightEditorState = (event: string, tabId: string, extra: Record<string, unknown> = {}) => {
    const editor = rightEditorRef.current;
    const model = editor?.getModel();
    const rawText = rawTextByTabRef.current[tabId] ?? '';
    const formattedText = formattedTextByTabRef.current[tabId] ?? '';
    const payload = {
      tabId,
      rawBytes: getUtf8ByteLength(rawText),
      formattedBytes: getUtf8ByteLength(formattedText),
      isActiveTab: activeTabIdRef.current === tabId,
      modelLanguageId: model?.getLanguageId() ?? null,
      modelLineCount: model?.getLineCount() ?? 0,
      modelValueLength: model?.getValueLength() ?? 0,
      largeMode: Boolean(largeModeRef.current[tabId]),
      locateEnabled: Boolean(largeFileLocateEnabledRef.current[tabId]),
      structureStatus: structureStatusRef.current[tabId] ?? null,
      withinStructureThreshold: getUtf8ByteLength(rawText) <= STRUCTURE_SYNC_THRESHOLD,
      ...extra,
    };

    logDiagnosticsToConsole(event, payload);
    logEvent(event, payload);
  };
  const { syncLeftModel, syncRightModel } = useJsonEditorModelSync({
    activeTabIdRef,
    largeModeRef,
    largeViewerDataByTab,
    largeViewerStatusByTab,
    leftEditorRef,
    leftViewStateByTabRef,
    logEvent,
    logRightEditorState,
    rawTextByTabRef,
    rightEditorRef,
    rightViewStateByTabRef,
    suppressLeftChangeRef,
    wrapLongLines,
  });

  const {
    getTabContent,
    resetSearchState,
    setLargeFileLocateEnabled,
    setLargeRawViewerData,
    setLargeViewerData,
    setLargeViewerSearchResults,
    setLargeViewerStatus,
    setLocateFeedback,
    setProcessingStage,
    setRightNodeSelection,
    setStructureStatus,
    setTabLargeMode,
    updateFormattedContent,
    updateTabContent,
  } = useJsonToolStateSetters({
    activeTabIdRef,
    clearLeftHighlights,
    clearRightHighlights,
    formattedTextByTabRef,
    largeFileLocateEnabledRef,
    largeModeRef,
    largeViewerMatches,
    rawTextByTabRef,
    resetLeftSearchState,
    resetRightSearchPaging,
    resetRightSearchState,
    setDocumentMeta,
    setIsRightSearchLoadingMore,
    setLargeFileLocateEnabledState,
    setLargeRawViewerDataByTab,
    setLargeRawViewerMatches,
    setLargeViewerCollapsedLinesByTab,
    setLargeViewerDataByTab,
    setLargeViewerMatchCount,
    setLargeViewerMatches,
    setLargeViewerStatusByTab,
    setLeftReplaceText,
    setLocateFeedbackByTab,
    setProcessingStageByTab,
    setRightNodeSelectionByTab,
    setRightSearchHasMore,
    setRightSearchNextOffset,
    setStructureStatusState,
    setTabLargeModeState,
    structureStatusRef,
    syncLeftModel,
    syncRightModel,
  });

  const {
    clearTabStructure,
    importJsonFile,
    importJsonText,
    queueFormat,
    queueRepair,
    queueFormatAfterEditSave,
    removeTabArtifacts,
    requestWorkerSearch,
    requestWorkerLocate,
    requestWorkerEditJson,
    requestWorkerEditJsonResult,
    resetTabArtifacts,
  } = useJsonFormattingWorker({
    activeTabIdRef,
    largeModeRef,
    largeFileLocateEnabledRef,
    leftViewStateByTabRef,
    rightViewStateByTabRef,
    structureStatusRef,
    workerStructureEnabledRef,
    rawTextByTabRef,
    formattedTextByTabRef,
    performanceSessionsRef,
    beginPerformanceSession,
    clearPerformanceState,
    logEvent,
    mutatePerformanceSession,
    syncPerformanceSnapshot,
    renameTab,
    removeTabState,
    setTabError,
    setTabImporting,
    setTabFormatting,
    setTabLargeMode,
    setProcessingStage,
    setLocateFeedback,
    setRightNodeSelection,
    setStructureStatus,
    setLargeViewerData,
    setLargeRawViewerData,
    setLargeViewerStatus,
    setLargeViewerSearchResults,
    setLeftSearchResults,
    updateTabContent,
    updateFormattedContent,
    resetSearchState,
    revealLeftRange,
    clearLeftHighlights,
    clearRightHighlights,
  });

  const { pinActiveRightPath, selectRightPinnedPath, toggleRightFoldAtOffset } = useRightPaneNavigationActions({
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
  });

  useE2eTestBridge({
    activeTabIdRef,
    importJsonText,
  });

  const { handleImportDragEnter, handleImportDragLeave, handleImportDragOver, handleImportDrop, isDragImportActive } =
    useJsonImportDropZone({
      activeTab,
      importJsonFile,
      setTabError,
    });

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  usePreserveActiveTabViewState({
    activeTabId,
    leftEditorRef,
    leftViewStateByTabRef,
    previousActiveTabIdRef,
    rightEditorRef,
    rightViewStateByTabRef,
  });

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    const currentRaw = getTabContent(activeTab.id);
    const currentFormatted = formattedTextByTabRef.current[activeTab.id] ?? '';
    syncLeftModel(activeTab.id, currentRaw);
    syncRightModel(activeTab.id, currentFormatted);
  }, [
    activeLargeViewerData,
    activeLargeViewerStatus,
    activeTab,
    activeDocumentMeta.formattedLength,
    activeDocumentMeta.rawLength,
  ]);

  useEffect(() => {
    if (!shouldUseDedicatedLeftViewer) {
      leftEditorRef.current?.updateOptions(
        getMonacoOptions({
          largeMode: isLargeFileMode,
          wrapLongLines,
        })
      );
      leftEditorRef.current?.layout();
    }
    if (!shouldUseDedicatedRightViewer && !isBuildingDedicatedRightViewer) {
      rightEditorRef.current?.updateOptions(
        getMonacoOptions({
          largeMode: isLargeFileMode,
          wrapLongLines,
          readOnly: true,
          enableStructuralFolding: shouldEnableRightPaneFolding,
        })
      );
      rightEditorRef.current?.layout();
    }
    if (activeTab && !shouldUseDedicatedRightViewer) {
      logRightEditorState(
        activeTab.id === activeTabId ? 'right-editor-options-refreshed' : 'right-editor-options-skipped',
        activeTab.id,
        {
          isLargeFileMode,
          shouldEnableRightPaneFolding,
          wrapLongLines,
        }
      );
    }
  }, [
    activeTab,
    activeTabId,
    isBuildingDedicatedRightViewer,
    isLargeFileMode,
    shouldUseDedicatedLeftViewer,
    shouldEnableRightPaneFolding,
    shouldUseDedicatedRightViewer,
    wrapLongLines,
  ]);

  const { closeLeftFind, closeRightFind, openLeftFind, openRightFind } = useJsonToolSearchEffects({
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
  });

  useRightNodeSelectionHighlight({
    editorRef: rightEditorRef,
    isDisabled: shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer,
    selection: activeRightNodeSelection,
  });

  const {
    copyLeftEditorSelection,
    cutLeftEditorSelection,
    leftEditorContextMenu,
    pasteIntoLeftEditor,
    registerLeftEditorContextMenu,
    selectAllLeftEditorText,
    setLeftEditorContextMenu,
  } = useLeftEditorContextMenu({
    activeTab,
    beginPerformanceSession,
    leftEditorRef,
    setTabError,
  });

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
          beginPerformanceSession(
            currentTabId,
            'paste',
            '剪贴板粘贴',
            null,
            getUtf8ByteLength(nextContent),
            isLargeDocument(nextContent)
          );
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

  const replaceAllLeftText = async (
    searchTerm: string,
    searchOptions: typeof leftSearchOptions,
    replacement: string
  ) => {
    if (!activeTab || !searchTerm) {
      return;
    }

    const currentTabId = activeTab.id;
    const currentText = getTabContent(currentTabId);

    try {
      const updated = await requestWorkerEditJson({
        tabId: currentTabId,
        operation: 'replace-text',
        text: currentText,
        searchTerm,
        searchOptions,
        replacement,
      });

      if (updated === currentText) {
        return;
      }

      if (getTabContent(currentTabId) !== currentText) {
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
    searchOptions: typeof leftSearchOptions,
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
      const replacementText = await requestWorkerEditJson({
        tabId: currentTabId,
        operation: 'replace-text',
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

  const { handleFileSelection, handleImport } = useJsonImportActions({
    activeTab,
    fileInputRef,
    importJsonFile,
    importJsonText,
    setTabError,
  });

  const {
    handleClear,
    handleEscapeJson,
    handleFormat,
    handleLargeFileLocateToggle,
    handleOpenEditJson,
    handleRepairJson,
    handleUnescapeJson,
  } = useJsonToolContentActions({
    activeTab,
    beginPerformanceSession,
    clearPerformanceState,
    clearTabStructure,
    getTabContent,
    largeModeRef,
    leftEditorRef,
    leftSearchWorkerRevisionRef,
    openDocumentEditSession,
    queueFormat,
    queueRepair,
    renameTab,
    requestWorkerEditJson,
    resetSearchState,
    resetTabArtifacts,
    setEditJsonBusyLabel,
    setLargeFileLocateEnabled,
    setStructureStatus,
    setTabError,
    setTabLargeMode,
    updateTabContent,
  });

  const { handleOpenEditNodeAtOffset, handleOpenUnescapedNodeAtOffset, readEditableNodeAtOffset } =
    useRightNodeEditOpeners({
      formattedTextByTabRef,
      openNodeEditSession,
      requestWorkerEditJson,
      setEditJsonBusyLabel,
      setTabError,
    });

  const { applyRightNodeMutationAtOffset, copyNodeDetailAtOffset, copyValueAtOffset } = useRightNodeActions({
    applyRawUpdate(tabId, updated) {
      updateTabContent(tabId, updated, true);
      setTabLargeMode(tabId, isLargeDocument(updated));
    },
    getTabContent,
    logEvent,
    queueFormatAfterEditSave,
    readEditableNodeAtOffset,
    requestWorkerEditJson,
    requestDeleteConfirmation: requestDeleteNode,
    requestRenameKey,
    resetSearchState,
    setEditJsonBusyLabel,
    setTabError,
  });

  const handleSaveEditJson = async () => {
    if (!activeTab) {
      return;
    }

    const currentTabId = activeTab.id;
    const currentTabTitle = activeTab.title;
    const isNodeEdit = editJsonSession?.mode === 'node';
    setEditJsonBusyLabel(isNodeEdit ? '正在更新当前节点...' : '正在更新原始 JSON...');
    try {
      const original = getTabContent(currentTabId);
      const saveResult = await requestWorkerEditJsonResult({
        tabId: currentTabId,
        operation: isNodeEdit ? 'save-node' : 'save',
        text: editJsonValueRef.current,
        originalText: original,
        path: editJsonSession?.path,
      });
      const updated = saveResult.data;
      if (typeof updated !== 'string') {
        throw new Error('JSON worker returned an empty result');
      }
      const largeMode = isLargeDocument(updated);
      beginPerformanceSession(currentTabId, 'edit-save', currentTabTitle, null, getUtf8ByteLength(updated), largeMode);

      mutatePerformanceSession(currentTabId, (session) => {
        session.leftModelStartedAt = performance.now();
      });
      updateTabContent(currentTabId, updated, true);
      mutatePerformanceSession(currentTabId, (session) => {
        session.leftModelCompletedAt = performance.now();
      });
      setTabLargeMode(currentTabId, largeMode);
      setEditJsonError(null);
      closeEditJson();
      resetSearchState();
      if (isNodeEdit && typeof saveResult.formattedText === 'string') {
        const rightModelStartedAt = performance.now();
        updateFormattedContent(currentTabId, saveResult.formattedText, true);
        const rightModelCompletedAt = performance.now();
        setLargeRawViewerData(currentTabId, saveResult.rawViewerData ?? null);
        setLargeViewerData(currentTabId, saveResult.viewerData ?? null);
        setLargeViewerStatus(currentTabId, saveResult.viewerData ? 'ready' : 'idle');
        setStructureStatus(
          currentTabId,
          saveResult.structureWarming
            ? 'building'
            : workerStructureEnabledRef.current[currentTabId]
              ? 'ready'
              : largeMode
                ? 'disabled'
                : 'ready'
        );
        setProcessingStage(currentTabId, saveResult.structureWarming ? 'building-index' : 'idle');
        setTabFormatting(currentTabId, false);
        mutatePerformanceSession(
          currentTabId,
          (session) => {
            session.pendingFormat = false;
            session.requestId = null;
            session.formatQueuedAt = rightModelStartedAt;
            session.formatStartedAt = rightModelStartedAt;
            session.formatCompletedAt = rightModelStartedAt;
            session.rightModelStartedAt = rightModelStartedAt;
            session.rightModelCompletedAt = rightModelCompletedAt;
            session.formattedBytes = getUtf8ByteLength(saveResult.formattedText ?? '');
            session.viewerIndexMs = typeof saveResult.viewerIndexMs === 'number' ? saveResult.viewerIndexMs : null;
            session.viewerReadyAt = rightModelCompletedAt;
            session.structureCompletedAt = rightModelCompletedAt;
            session.structureEnabled = Boolean(workerStructureEnabledRef.current[currentTabId]);
            session.status = 'ready';
            session.error = null;
          },
          true
        );
      } else {
        queueFormatAfterEditSave(currentTabId, updated);
      }
    } catch (error) {
      setEditJsonError(error instanceof Error ? `保存 JSON 失败：${error.message}` : '保存 JSON 失败');
      setEditJsonBusyLabel(null);
    }
  };

  const handleTransformEditJsonContent = async (
    operation: Extract<EditJsonWorkerOperation, 'escape-json' | 'unescape-json'>,
    label: string,
    value: string
  ) => {
    if (!activeTab) {
      throw new Error('当前没有可编辑的 JSON');
    }

    if (!value.trim()) {
      const errorMessage = `没有可${label}的编辑内容`;
      setEditJsonError(errorMessage);
      throw new Error(errorMessage);
    }

    setEditJsonBusyLabel(`正在${label}编辑内容...`);
    try {
      const transformed = await requestWorkerEditJson({ tabId: activeTab.id, operation, text: value });
      editJsonValueRef.current = transformed;
      setEditJsonError(null);
      return transformed;
    } catch (error) {
      setEditJsonError(error instanceof Error ? `${label}编辑内容失败：${error.message}` : `${label}编辑内容失败`);
      throw error;
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleUnescapeEditJsonContent = (value: string) =>
    handleTransformEditJsonContent('unescape-json', '反转义', value);

  const handleEscapeEditJsonContent = (value: string) => handleTransformEditJsonContent('escape-json', '转义', value);

  const handleCopyEscapedJson = async () => {
    if (!activeTab) {
      return;
    }

    setEditJsonBusyLabel('正在复制字符串字面量...');
    try {
      const literal = await requestWorkerEditJson({
        tabId: activeTab.id,
        operation: 'copy-literal',
        text: editJsonValueRef.current,
      });
      await writeTextToClipboard(literal);
      setEditJsonError(null);
      showCopyLiteralNotice();
    } catch (error) {
      setEditJsonError(error instanceof Error ? `复制字符串字面量失败：${error.message}` : '复制字符串字面量失败');
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const { addTab, closeTab } = useJsonToolTabActions({
    activeTabId,
    activeTabIdRef,
    formattedTextByTabRef,
    handleClear,
    initializeTabArtifacts,
    initializeTabState,
    largeFileLocateEnabledRef,
    largeModeRef,
    leftEditorRef,
    leftSearchWorkerRevisionRef,
    leftViewStateByTabRef,
    rawTextByTabRef,
    removeTabArtifacts,
    removeTabArtifactsState,
    rightEditorRef,
    rightViewStateByTabRef,
    setActiveTabId,
    setPerformanceByTab,
    setTabs,
    structureStatusRef,
    tabs,
    workerStructureEnabledRef,
  });

  const handleRightMount: OnMount = useRightEditorActions({
    activeTabIdRef,
    applyRightNodeMutationAtOffset,
    copyNodeDetailAtOffset,
    copyValueAtOffset,
    formattedTextByTabRef,
    handleOpenEditNodeAtOffset,
    handleOpenUnescapedNodeAtOffset,
    largeModeRef,
    logRightEditorState,
    openRightFind,
    requestWorkerLocate,
    rightContextMenuOffsetByTabRef,
    rightEditorRef,
    rightViewStateByTabRef,
    setRightEditorContextMenu,
    structureStatusRef,
    syncRightModel,
    workerStructureEnabledRef,
    wrapLongLines,
  });

  useContextualFindShortcut({
    openLeftFind,
    openRightFind,
  });

  const {
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
  } = useJsonPaneSearchActions({
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
    replaceCurrentLeftText: (searchTerm, searchOptions, replacement) => {
      void replaceCurrentLargeLeftText(searchTerm, searchOptions, replacement);
    },
    replaceAllLeftText: (searchTerm, searchOptions, replacement) => {
      void replaceAllLeftText(searchTerm, searchOptions, replacement);
    },
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
  });

  if (!activeTab) {
    return null;
  }

  return (
    <div
      className={isDarkMode ? 'app-container dark-mode' : 'app-container'}
      onDragEnter={handleImportDragEnter}
      onDragOver={handleImportDragOver}
      onDragLeave={handleImportDragLeave}
      onDrop={handleImportDrop}
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.txt,application/json,text/plain"
        style={{ display: 'none' }}
        onChange={handleFileSelection}
      />

      <JsonToolOverlayLayer
        activeTabId={activeTab.id}
        diagnosticsContext={diagnosticsContext}
        editJsonBusyLabel={editJsonBusyLabel}
        editJsonError={editJsonError}
        editJsonSession={editJsonSession}
        getTabText={getTabContent}
        hasCopiedLiteral={hasCopiedLiteral}
        isAboutOpen={isAboutOpen}
        isArchitectureWarningDismissed={isArchitectureWarningDismissed}
        isCompareOpen={isCompareOpen}
        isDarkMode={isDarkMode}
        isDiagnosticsLogOpen={isDiagnosticsLogOpen}
        isDragImportActive={isDragImportActive}
        onCancelMutationDialog={cancelMutationDialog}
        onCloseAbout={() => setIsAboutOpen(false)}
        onCloseCompare={() => setIsCompareOpen(false)}
        onCloseDiagnosticsLog={() => setIsDiagnosticsLogOpen(false)}
        onCloseEditJson={closeEditJson}
        onConfirmDeleteMutationDialog={confirmDeleteDialog}
        onConfirmRenameMutationDialog={confirmRenameDialog}
        onCopyEscapedJson={handleCopyEscapedJson}
        onDismissArchitectureWarning={() => setIsArchitectureWarningDismissed(true)}
        onEditJsonValueChange={(value) => {
          editJsonValueRef.current = value;
        }}
        onEscapeEditJsonContent={handleEscapeEditJsonContent}
        onOpenAbout={() => setIsAboutOpen(true)}
        onSaveEditJson={handleSaveEditJson}
        onUnescapeEditJsonContent={handleUnescapeEditJsonContent}
        rightNodeMutationDialog={rightNodeMutationDialog}
        runtimeInfo={runtimeInfo}
        tabs={tabs}
        t={t}
        version={APP_VERSION}
      />

      <JsonToolToolbar
        onImport={handleImport}
        onFormat={handleFormat}
        onRepairJson={handleRepairJson}
        onUnescapeJson={handleUnescapeJson}
        onEscapeJson={handleEscapeJson}
        onClear={handleClear}
        onEditJson={handleOpenEditJson}
        onOpenCompare={() => setIsCompareOpen(true)}
        onOpenDiagnosticsLog={() => setIsDiagnosticsLogOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        onFoldAll={() => {
          if (shouldUseDedicatedRightViewer) {
            largeViewerRef.current?.foldAll();
            return;
          }
          rightEditorRef.current?.getAction('editor.foldAll')?.run();
        }}
        onUnfoldAll={() => {
          if (shouldUseDedicatedRightViewer) {
            largeViewerRef.current?.unfoldAll();
            return;
          }
          rightEditorRef.current?.getAction('editor.unfoldAll')?.run();
        }}
        canControlRightPaneFolding={canControlRightPaneFolding}
        isLargeFileMode={isLargeFileMode}
        canEditJson={canEditJson}
        canCompareJson={tabs.length >= 2}
        wrapLongLines={wrapLongLines}
        onWrapLongLinesChange={setWrapLongLines}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((current) => !current)}
        isLargeFileLocateEnabled={isLargeFileLocateEnabled}
        onLargeFileLocateToggle={handleLargeFileLocateToggle}
        showPerformancePanel={showPerformancePanel}
        onShowPerformancePanelChange={setShowPerformancePanel}
        importingFileName={importingFileName}
        canEnableLargeFileLocate={canEnableLargeFileLocate}
        usesLightweightLocate={usesLightweightLocate}
        currentStructureStatus={currentStructureStatus}
        processingStageText={processingStageText}
        currentError={currentError}
        language={language}
        onLanguageChange={setLanguage}
        t={t}
      />

      {showPerformancePanel && (
        <JsonPerformancePanel
          snapshot={activePerformanceSnapshot}
          history={performanceHistory}
          isDarkMode={isDarkMode}
        />
      )}

      <JsonToolTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        renamingTab={renamingTab}
        onSelectTab={setActiveTabId}
        onStartRenaming={startRenamingTab}
        onRenamingChange={handleRenamingChange}
        onFinishRenaming={finishRenaming}
        onCancelRenaming={cancelRenaming}
        onCloseTab={closeTab}
        onAddTab={addTab}
      />

      <JsonEditorPanes
        activeLargeRawViewerData={activeLargeRawViewerData}
        activeLargeViewerCollapsedLines={activeLargeViewerCollapsedLines}
        activeLargeViewerData={activeLargeViewerData}
        activeLeftMatchCount={activeLeftMatchCount}
        activeRawText={activeRawText}
        activeRightMatchCount={activeRightMatchCount}
        formattedValue={formattedValue}
        isBuildingDedicatedRightViewer={isBuildingDedicatedRightViewer}
        isDarkMode={isDarkMode}
        isFormattingActiveTab={isFormattingActiveTab}
        isImportingActiveTab={isImportingActiveTab}
        isLargeFileMode={isLargeFileMode}
        isLeftFindOpen={isLeftFindOpen}
        isRightFindOpen={isRightFindOpen}
        largeRawViewerRef={largeRawViewerRef}
        largeViewerMatches={largeViewerMatches}
        largeViewerRef={largeViewerRef}
        leftPaneMetaText={leftPaneMetaText}
        leftRawHighlightRange={leftRawHighlightRange}
        leftReplaceText={leftReplaceText}
        leftSearchHasMore={leftSearchHasMore}
        leftSearchOptions={leftSearchOptions}
        leftSearchTerm={leftSearchTerm}
        normalizedLeftMatchIndex={normalizedLeftMatchIndex}
        normalizedRightMatchIndex={normalizedRightMatchIndex}
        processingStageText={processingStageText}
        rightMatchIndex={rightMatchIndex}
        rightPaneMetaText={rightPaneMetaText}
        rightPinnedPaths={activeRightPinnedPathItems}
        rightRecentSearches={rightRecentSearches}
        rightSearchHasMore={rightSearchHasMore}
        rightSearchOptions={rightSearchOptions}
        rightSelectedRange={activeRightSelectedRange}
        rightSearchTerm={rightSearchTerm}
        shouldEnableRightPaneFolding={shouldEnableRightPaneFolding}
        shouldShowLeftPlaceholder={activeDocumentMeta.rawLength === 0 && !isImportingActiveTab}
        shouldUseDedicatedLeftViewer={shouldUseDedicatedLeftViewer}
        shouldUseDedicatedRightViewer={shouldUseDedicatedRightViewer}
        wrapLongLines={wrapLongLines}
        isLeftSearchLoadingMore={isLeftSearchLoadingMore}
        isRightSearchLoadingMore={isRightSearchLoadingMore}
        onCloseLeftFind={closeLeftFind}
        onCloseRightFind={closeRightFind}
        onCopyRightCompactJson={(offset) => copyNodeDetailAtOffset(activeTab.id, offset, true, 'compact-json')}
        onCopyRightFormattedJson={(offset) => copyNodeDetailAtOffset(activeTab.id, offset, true, 'formatted-json')}
        onCopyRightKey={(offset) => copyNodeDetailAtOffset(activeTab.id, offset, true, 'key')}
        onCopyRightPath={(offset) => copyNodeDetailAtOffset(activeTab.id, offset, true, 'path')}
        onCopyRightValue={(offset) => copyValueAtOffset(activeTab.id, offset, true)}
        onDeleteRightValue={(offset) => applyRightNodeMutationAtOffset(activeTab.id, offset, true, 'delete-node')}
        onEditRightValue={(offset) => handleOpenEditNodeAtOffset(activeTab.id, offset, true)}
        onLeftChange={handleLeftChange}
        onLeftMount={handleLeftMount}
        onLeftReplace={replaceLeftMatch}
        onLeftReplaceAll={replaceAllLeftMatches}
        onLeftReplaceValueChange={setLeftReplaceText}
        onLeftSearchOptionsChange={handleLeftSearchOptionsChange}
        onLeftSearchTermChange={handleLeftSearchTermChange}
        onLoadMoreLeftSearch={loadMoreLeftSearch}
        onLoadMoreRightSearch={loadMoreRightSearch}
        onLocateRightOffset={(offset) => requestWorkerLocate(activeTab.id, offset)}
        onOpenRightFind={openRightFind}
        onPinCurrentRightPath={pinActiveRightPath}
        onRenameRightKey={(offset) => applyRightNodeMutationAtOffset(activeTab.id, offset, true, 'rename-node-key')}
        onSelectRightPinnedPath={selectRightPinnedPath}
        onSelectRightRecentSearch={(value) => {
          setRightSearchTerm(value);
          setRightMatchIndex(0);
          setIsRightFindOpen(true);
          rememberRightSearchTerm(value);
        }}
        onUnescapeRightValue={(offset) => handleOpenUnescapedNodeAtOffset(activeTab.id, offset, true)}
        onPrevLeft={gotoPrevLeft}
        onPrevRight={gotoPrevRight}
        onNextLeft={gotoNextLeft}
        onNextRight={gotoNextRight}
        onRightCollapsedLinesChange={(lines) => {
          setLargeViewerCollapsedLinesByTab((current) => ({
            ...current,
            [activeTab.id]: lines,
          }));
        }}
        onRightMatchCountChange={setLargeViewerMatchCount}
        onRightMount={handleRightMount}
        onRightSearchOptionsChange={handleRightSearchOptionsChange}
        onRightSearchTermChange={handleRightSearchTermChange}
        t={t}
      />

      <JsonToolContextMenus
        applyRightNodeMutationAtOffset={applyRightNodeMutationAtOffset}
        copyLeftEditorSelection={copyLeftEditorSelection}
        copyNodeDetailAtOffset={copyNodeDetailAtOffset}
        copyValueAtOffset={copyValueAtOffset}
        cutLeftEditorSelection={cutLeftEditorSelection}
        handleOpenEditNodeAtOffset={handleOpenEditNodeAtOffset}
        handleOpenUnescapedNodeAtOffset={handleOpenUnescapedNodeAtOffset}
        isDarkMode={isDarkMode}
        leftEditorContextMenu={leftEditorContextMenu}
        pasteIntoLeftEditor={pasteIntoLeftEditor}
        rightEditorContextMenu={rightEditorContextMenu}
        selectAllLeftEditorText={selectAllLeftEditorText}
        setLeftEditorContextMenu={setLeftEditorContextMenu}
        setRightEditorContextMenu={setRightEditorContextMenu}
        shouldUseDedicatedLeftViewer={shouldUseDedicatedLeftViewer}
        shouldUseDedicatedRightViewer={shouldUseDedicatedRightViewer}
        t={t}
        toggleRightFoldAtOffset={toggleRightFoldAtOffset}
      />
    </div>
  );
};

export default App;
