import React, { useCallback, useEffect, useState } from 'react';
import { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import AboutDialog from './components/AboutDialog';
import ArchitectureWarningDialog from './components/ArchitectureWarningDialog';
import JsonCompareDialog from './components/JsonCompareDialog';
import JsonEditModal from './components/JsonEditModal';
import LeftEditorContextMenu from './components/LeftEditorContextMenu';
import type { LeftEditorContextMenuState } from './components/LeftEditorContextMenu';
import RightNodeMutationDialog from './components/RightNodeMutationDialog';
import DiagnosticsLogPanel from './components/DiagnosticsLogPanel';
import JsonEditorPanes from './components/JsonEditorPanes';
import JsonPerformancePanel from './components/JsonPerformancePanel';
import JsonToolTabBar from './components/JsonToolTabBar';
import JsonToolToolbar from './components/JsonToolToolbar';
import { useJsonToolDialogs } from './hooks/useJsonToolDialogs';
import { useJsonToolRefs, usePreserveActiveTabViewState } from './hooks/useJsonToolRefs';
import { useJsonEditSession } from './hooks/useJsonEditSession';
import { useJsonFormattingWorker } from './hooks/useJsonFormattingWorker';
import { useJsonPerformanceTracking } from './hooks/useJsonPerformanceTracking';
import { useRightNodeSelectionHighlight } from './hooks/useRightNodeSelectionHighlight';
import RightEditorContextMenu from './components/RightEditorContextMenu';
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
import { getCompactPathLabel, useRightSearchQuickAccess } from './hooks/useRightSearchQuickAccess';
import {
  DEFAULT_TAB_TITLE,
  INITIAL_TAB_ID,
  LocateFeedback,
  ProcessingStage,
  StructureStatus,
  STRUCTURE_SYNC_THRESHOLD,
} from './types/jsonTool';
import type {
  EditJsonWorkerOperation,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeRawViewerData,
  RightNodeSelection,
} from './types/jsonTool';
import { createTab, selectionCoversModel } from './utils/jsonToolModels';
import {
  bindEditorFocusContext,
  getContentAfterSelectionReplace,
  registerPaneFindAction,
  registerPasteContentTracking,
  registerSelectAllDeleteCommands,
} from './utils/jsonEditorMountActions';
import { getUtf8ByteLength, isLargeDocument, shouldUseLargeMode } from './utils/jsonDocumentMetrics';
import { formatBytes, formatDuration, getMonacoOptions, getMonacoSearchBatch } from './utils/jsonEditorInteractions';
import { getProcessingStageText } from './utils/jsonProcessingStage';
import { getRightPaneStatusText } from './utils/rightPaneStatus';
import { readTextFromClipboard, writeTextToClipboard } from './utils/clipboard';
import { APP_VERSION } from './utils/appInfo';
import { buildDiagnosticsContext } from './utils/diagnosticsContext';
import { logDiagnosticsToConsole } from './utils/diagnosticsLogger';
import { getViewportContextMenuPosition } from './utils/contextMenuPosition';
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
  const [leftEditorContextMenu, setLeftEditorContextMenu] = useState<LeftEditorContextMenuState | null>(null);
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
  const normalizedRightMatchIndex =
    activeRightMatchCount > 0
      ? ((rightMatchIndex % activeRightMatchCount) + activeRightMatchCount) % activeRightMatchCount
      : 0;
  const processingStageText = getProcessingStageText(activeProcessingStage, importingFileName);
  const leftPaneMetaText = [
    activeDocumentMeta.rawLength > 0 ? `内存 ${formatBytes(activeDocumentMeta.rawLength)}` : null,
    formatDuration(activePerformanceSnapshot?.readFileMs)
      ? `导入 ${formatDuration(activePerformanceSnapshot?.readFileMs)}`
      : null,
    activeLocateFeedback?.message ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
  const rightPaneStatusText = getRightPaneStatusText({
    canEnableLargeFileLocate,
    canUseRightPaneFolding,
    currentStructureStatus,
    isLargeFileLocateEnabled,
    isLargeFileMode,
    usesDedicatedRightViewer: shouldUseDedicatedRightViewer,
    usesLightweightLocate,
  });
  const rightPaneMetaText = [
    activeDocumentMeta.formattedLength > 0 ? `内存 ${formatBytes(activeDocumentMeta.formattedLength)}` : null,
    formatDuration(activePerformanceSnapshot?.formatWorkerMs)
      ? `格式化 ${formatDuration(activePerformanceSnapshot?.formatWorkerMs)}`
      : null,
    activeRightNodeSelection?.pathText ? `路径 ${getCompactPathLabel(activeRightNodeSelection.pathText)}` : null,
    rightPaneStatusText,
  ]
    .filter(Boolean)
    .join(' · ');
  const diagnosticsContext = buildDiagnosticsContext({
    activeDocumentMeta,
    activeLeftMatchCount,
    activePerformanceSnapshot,
    activeProcessingStage,
    activeRightMatchCount,
    activeRightNodeSelection,
    activeTab,
    currentError,
    currentStructureStatus,
    importingFileName,
    isFormattingActiveTab,
    isLargeFileLocateEnabled,
    isLargeFileMode,
    leftSearchHasMore,
    leftSearchTerm,
    normalizedLeftMatchIndex,
    normalizedRightMatchIndex,
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
    editor.setPosition(position);
    editor.focus();
    void editor.getAction('editor.toggleFold')?.run();
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

  const resetSearchState = () => {
    resetLeftSearchState();
    resetRightSearchState();
    setLeftReplaceText('');
    setLargeRawViewerMatches([]);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    clearLeftHighlights();
    clearRightHighlights();
  };

  const setTabLargeMode = (tabId: string, enabled: boolean) => {
    largeModeRef.current[tabId] = enabled;
    setTabLargeModeState(tabId, enabled);
  };

  const setProcessingStage = (tabId: string, stage: ProcessingStage) => {
    setProcessingStageByTab((current) => ({ ...current, [tabId]: stage }));
  };

  const setLocateFeedback = (tabId: string, feedback: LocateFeedback | null) => {
    setLocateFeedbackByTab((current) => ({ ...current, [tabId]: feedback }));
  };

  const setRightNodeSelection = (tabId: string, selection: RightNodeSelection | null) => {
    setRightNodeSelectionByTab((current) => ({ ...current, [tabId]: selection }));
  };

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

  const setLargeFileLocateEnabled = (tabId: string, enabled: boolean) => {
    largeFileLocateEnabledRef.current[tabId] = enabled;
    setLargeFileLocateEnabledState(tabId, enabled);
  };

  const setStructureStatus = (tabId: string, status: StructureStatus) => {
    structureStatusRef.current[tabId] = status;
    setStructureStatusState(tabId, status);
  };

  const setLargeViewerData = (tabId: string, data: LargeJsonViewerData | null) => {
    setLargeViewerDataByTab((current) => ({ ...current, [tabId]: data }));
    setLargeViewerCollapsedLinesByTab((current) => ({ ...current, [tabId]: [] }));
    setRightNodeSelection(tabId, null);
    if (tabId === activeTabIdRef.current) {
      setLargeViewerMatches([]);
      setLargeViewerMatchCount(0);
      resetRightSearchPaging();
    }
  };

  const setLargeRawViewerData = (tabId: string, data: LargeRawViewerData | null) => {
    setLargeRawViewerDataByTab((current) => ({ ...current, [tabId]: data }));
  };

  const setLargeViewerStatus = (tabId: string, status: 'idle' | 'building' | 'ready') => {
    setLargeViewerStatusByTab((current) => ({ ...current, [tabId]: status }));
  };

  const setLargeViewerSearchResults = (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore = false,
    nextStartOffset = 0,
    append = false
  ) => {
    if (tabId !== activeTabIdRef.current) {
      return;
    }

    const nextMatches = append ? [...largeViewerMatches, ...matches] : matches;
    setLargeViewerMatches(nextMatches);
    setLargeViewerMatchCount(nextMatches.length);
    setRightSearchHasMore(hasMore);
    setRightSearchNextOffset(nextStartOffset);
    setIsRightSearchLoadingMore(false);
  };

  const getTabContent = (tabId: string) => rawTextByTabRef.current[tabId] ?? '';

  const updateTabContent = (tabId: string, content: string, syncModel = false) => {
    const byteLength = getUtf8ByteLength(content);
    rawTextByTabRef.current[tabId] = content;
    setLargeRawViewerData(tabId, null);
    setRightNodeSelection(tabId, null);
    setDocumentMeta(tabId, (current) => ({
      ...current,
      rawLength: byteLength,
      rawRevision: current.rawRevision + 1,
    }));

    if (syncModel) {
      syncLeftModel(tabId, content, true);
    }
  };

  const updateFormattedContent = (tabId: string, content: string, syncModel = false) => {
    const byteLength = getUtf8ByteLength(content);
    formattedTextByTabRef.current[tabId] = content;
    setRightNodeSelection(tabId, null);
    setDocumentMeta(tabId, (current) => ({
      ...current,
      formattedLength: byteLength,
      formattedRevision: current.formattedRevision + 1,
    }));

    if (syncModel) {
      syncRightModel(tabId, content, true);
    }
  };

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

  useEffect(() => {
    resetSearchState();
  }, [activeTabId]);

  useEffect(() => {
    if (!leftEditorContextMenu) {
      return;
    }

    const closeMenu = () => setLeftEditorContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [leftEditorContextMenu]);

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

  useRightNodeSelectionHighlight({
    editorRef: rightEditorRef,
    isDisabled: shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer,
    selection: activeRightNodeSelection,
  });

  const beginPastePerformanceSession = (tabId: string, nextContent: string) => {
    beginPerformanceSession(
      tabId,
      'paste',
      '剪贴板粘贴',
      null,
      getUtf8ByteLength(nextContent),
      shouldUseLargeMode(nextContent)
    );
  };

  const copyLeftEditorSelection = async () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();

    if (!editor || !model || !selection || selection.isEmpty()) {
      return;
    }

    await writeTextToClipboard(model.getValueInRange(selection));
    editor.focus();
  };

  const cutLeftEditorSelection = async () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();

    if (!editor || !model || !selection || selection.isEmpty()) {
      return;
    }

    await writeTextToClipboard(model.getValueInRange(selection));
    editor.focus();
    editor.executeEdits('left-editor-context-menu-cut', [
      {
        range: selection,
        text: '',
        forceMoveMarkers: true,
      },
    ]);
    editor.pushUndoStop();
  };

  const pasteIntoLeftEditor = async () => {
    if (!activeTab) {
      return;
    }

    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();

    if (!editor || !model || !selection) {
      return;
    }

    try {
      const clipboardText = await readTextFromClipboard();
      if (!clipboardText) {
        editor.focus();
        return;
      }

      beginPastePerformanceSession(activeTab.id, getContentAfterSelectionReplace(model, selection, clipboardText));
      editor.focus();
      editor.executeEdits('left-editor-context-menu-paste', [
        {
          range: selection,
          text: clipboardText,
          forceMoveMarkers: true,
        },
      ]);
      editor.pushUndoStop();
    } catch (error) {
      setTabError(activeTab.id, error instanceof Error ? `粘贴失败：${error.message}` : '粘贴失败');
    }
  };

  const selectAllLeftEditorText = () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model) {
      return;
    }

    editor.focus();
    editor.setSelection(model.getFullModelRange());
  };

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

    editor.onContextMenu((event) => {
      const browserEvent = event.event.browserEvent as MouseEvent | undefined;
      const position = event.target.position ?? editor.getPosition();
      const selection = editor.getSelection();
      const hasSelection = Boolean(selection && !selection.isEmpty());
      const rightClickIsInsideSelection = Boolean(hasSelection && position && selection?.containsPosition(position));

      event.event.preventDefault();
      event.event.stopPropagation();

      if (position && !rightClickIsInsideSelection) {
        editor.setPosition(position);
      }

      const menuPosition = getViewportContextMenuPosition(
        browserEvent?.clientX ?? event.event.posx ?? 0,
        browserEvent?.clientY ?? event.event.posy ?? 0,
        4
      );
      setLeftEditorContextMenu({
        x: menuPosition.x,
        y: menuPosition.y,
        hasSelection,
      });
    });

    editor.onMouseDown((event) => {
      if (!event.event.rightButton) {
        setLeftEditorContextMenu(null);
      }
    });
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

  const handleFormat = () => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    if (!currentText.trim()) {
      clearPerformanceState(activeTab.id);
      queueFormat(activeTab.id, currentText, true);
      return;
    }

    const largeMode = isLargeDocument(currentText);
    beginPerformanceSession(
      activeTab.id,
      'manual-format',
      activeTab.title,
      null,
      getUtf8ByteLength(currentText),
      largeMode
    );
    setTabLargeMode(activeTab.id, largeMode);
    queueFormat(activeTab.id, currentText, true);
  };

  const handleRepairJson = () => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    if (!currentText.trim()) {
      setTabError(activeTab.id, '没有可修复的 JSON 内容');
      return;
    }

    const largeMode = isLargeDocument(currentText);
    beginPerformanceSession(activeTab.id, 'repair', activeTab.title, null, getUtf8ByteLength(currentText), largeMode);
    setTabLargeMode(activeTab.id, largeMode);
    queueRepair(activeTab.id, currentText);
  };

  const handleJsonEscapeTransform = async (
    operation: Extract<EditJsonWorkerOperation, 'escape-json' | 'unescape-json'>,
    label: string
  ) => {
    if (!activeTab) {
      return;
    }

    const currentTabId = activeTab.id;
    const editor = leftEditorRef.current;
    const model = editor?.getModel() ?? null;
    const selection = editor?.getSelection() ?? null;
    const hasSelection = Boolean(model && selection && !selection.isEmpty());
    const sourceText =
      hasSelection && model && selection ? model.getValueInRange(selection) : getTabContent(currentTabId);

    if (!sourceText.trim()) {
      setTabError(currentTabId, `没有可${label}的内容`);
      return;
    }

    setEditJsonBusyLabel(`正在${label}...`);
    try {
      const transformed = await requestWorkerEditJson({ tabId: currentTabId, operation, text: sourceText });
      const nextContent =
        hasSelection && model && selection
          ? getContentAfterSelectionReplace(model, selection, transformed)
          : transformed;
      const largeMode = isLargeDocument(nextContent);

      setTabLargeMode(currentTabId, largeMode);
      setTabError(currentTabId, null);

      if (hasSelection && editor && selection) {
        editor.executeEdits('json-escape-transform', [
          {
            range: selection,
            text: transformed,
            forceMoveMarkers: true,
          },
        ]);
        resetSearchState();
        return;
      }

      updateTabContent(currentTabId, transformed, true);
      resetSearchState();
      queueFormat(currentTabId, transformed, true);
    } catch (error) {
      setTabError(currentTabId, error instanceof Error ? `${label}失败：${error.message}` : `${label}失败`);
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleUnescapeJson = () => {
    void handleJsonEscapeTransform('unescape-json', '反转义');
  };

  const handleEscapeJson = () => {
    void handleJsonEscapeTransform('escape-json', '转义');
  };

  const handleOpenEditJson = async () => {
    if (!activeTab) {
      return;
    }

    setEditJsonBusyLabel('正在准备编辑内容...');
    try {
      const raw = getTabContent(activeTab.id);
      const formatted = await requestWorkerEditJson({ tabId: activeTab.id, operation: 'format', text: raw });
      openDocumentEditSession(formatted);
    } catch (error) {
      setTabError(activeTab.id, error instanceof Error ? `打开 JSON 编辑失败：${error.message}` : '打开 JSON 编辑失败');
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

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

  const handleLargeFileLocateToggle = (enabled: boolean) => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    const largeMode = Boolean(largeModeRef.current[activeTab.id]) || isLargeDocument(currentText);
    setLargeFileLocateEnabled(activeTab.id, enabled);

    if (!currentText.trim()) {
      setStructureStatus(activeTab.id, 'ready');
      return;
    }

    if (!enabled) {
      clearTabStructure(activeTab.id, largeMode ? 'disabled' : 'ready');
      return;
    }

    queueFormat(activeTab.id, currentText, true);
  };

  const handleClear = () => {
    if (!activeTab) {
      return;
    }

    renameTab(activeTab.id, DEFAULT_TAB_TITLE);
    delete leftSearchWorkerRevisionRef.current[activeTab.id];
    resetTabArtifacts(activeTab.id);
    resetSearchState();
  };

  const addTab = () => {
    const nextId = `tab-${Date.now()}`;
    const currentTabId = activeTabIdRef.current;

    if (currentTabId) {
      leftViewStateByTabRef.current[currentTabId] =
        leftEditorRef.current?.saveViewState() ?? leftViewStateByTabRef.current[currentTabId] ?? null;
      rightViewStateByTabRef.current[currentTabId] =
        rightEditorRef.current?.saveViewState() ?? rightViewStateByTabRef.current[currentTabId] ?? null;
    }

    rawTextByTabRef.current[nextId] = '';
    formattedTextByTabRef.current[nextId] = '';
    initializeTabState(nextId);
    setPerformanceByTab((current) => ({ ...current, [nextId]: null }));
    initializeTabArtifacts(nextId);
    largeModeRef.current[nextId] = false;
    largeFileLocateEnabledRef.current[nextId] = false;
    structureStatusRef.current[nextId] = 'ready';
    workerStructureEnabledRef.current[nextId] = false;
    setTabs((currentTabs) => [...currentTabs, createTab(nextId)]);
    setActiveTabId(nextId);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) {
      handleClear();
      return;
    }

    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    const fallbackTab = tabs[closingIndex === 0 ? 1 : closingIndex - 1];

    setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== tabId));
    delete leftSearchWorkerRevisionRef.current[tabId];
    removeTabArtifacts(tabId);
    removeTabArtifactsState(tabId);

    if (activeTabId === tabId) {
      setActiveTabId(fallbackTab.id);
    }
  };

  const openLeftFind = useCallback(() => {
    setIsLeftFindOpen(true);
  }, [setIsLeftFindOpen]);

  const openRightFind = useCallback(() => {
    setIsRightFindOpen(true);
  }, [setIsRightFindOpen]);

  const closeLeftFind = () => {
    resetLeftSearchState();
    clearLeftHighlights();
    if (shouldUseDedicatedLeftViewer) {
      largeRawViewerRef.current?.focus();
    } else {
      leftEditorRef.current?.focus();
    }
  };

  const closeRightFind = () => {
    resetRightSearchState();
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    clearRightHighlights();
    if (shouldUseDedicatedRightViewer) {
      largeViewerRef.current?.focus();
    } else {
      rightEditorRef.current?.focus();
    }
  };

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

      {isDragImportActive && (
        <div className="drag-import-overlay">
          <div className={`drag-import-panel ${isDarkMode ? 'dark' : ''}`}>
            <span className="drag-import-title">{t('drag.title')}</span>
            <span className="drag-import-subtitle">{t('drag.subtitle')}</span>
          </div>
        </div>
      )}

      {runtimeInfo?.isMacTranslated && !isArchitectureWarningDismissed && (
        <ArchitectureWarningDialog
          isDarkMode={isDarkMode}
          onClose={() => setIsArchitectureWarningDismissed(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
      )}

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

      {editJsonSession && (
        <JsonEditModal
          sessionKey={editJsonSession.key}
          initialValue={editJsonSession.initialValue}
          isDarkMode={isDarkMode}
          error={editJsonError}
          busyLabel={editJsonBusyLabel}
          hasCopiedLiteral={hasCopiedLiteral}
          title={editJsonSession.mode === 'node' ? t('edit.nodeTitle') : t('edit.title')}
          pathText={editJsonSession.pathText}
          saveLabel={editJsonSession.mode === 'node' ? t('edit.saveNode') : t('edit.saveJson')}
          onValueChange={(value) => {
            editJsonValueRef.current = value;
          }}
          onSave={handleSaveEditJson}
          onUnescapeContent={handleUnescapeEditJsonContent}
          onEscapeContent={handleEscapeEditJsonContent}
          onCopyLiteral={handleCopyEscapedJson}
          onClose={closeEditJson}
          t={t}
        />
      )}

      {rightNodeMutationDialog && (
        <RightNodeMutationDialog
          state={rightNodeMutationDialog}
          isDarkMode={isDarkMode}
          onCancel={cancelMutationDialog}
          onConfirmDelete={confirmDeleteDialog}
          onConfirmRename={confirmRenameDialog}
          t={t}
        />
      )}

      {isDiagnosticsLogOpen && (
        <DiagnosticsLogPanel
          isDarkMode={isDarkMode}
          context={diagnosticsContext}
          onClose={() => setIsDiagnosticsLogOpen(false)}
        />
      )}

      {isCompareOpen && (
        <JsonCompareDialog
          tabs={tabs}
          activeTabId={activeTab.id}
          isDarkMode={isDarkMode}
          getTabText={getTabContent}
          onClose={() => setIsCompareOpen(false)}
          t={t}
        />
      )}

      {isAboutOpen && (
        <AboutDialog
          version={APP_VERSION}
          isDarkMode={isDarkMode}
          runtimeInfo={runtimeInfo}
          onClose={() => setIsAboutOpen(false)}
          t={t}
        />
      )}

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

      {rightEditorContextMenu && !shouldUseDedicatedRightViewer && (
        <RightEditorContextMenu
          contextMenu={rightEditorContextMenu}
          isDarkMode={isDarkMode}
          onClose={() => setRightEditorContextMenu(null)}
          onToggleFold={toggleRightFoldAtOffset}
          onCopyPath={(tabId, offset) => copyNodeDetailAtOffset(tabId, offset, true, 'path')}
          onCopyKey={(tabId, offset) => copyNodeDetailAtOffset(tabId, offset, true, 'key')}
          onCopyValue={(tabId, offset) => copyValueAtOffset(tabId, offset, true)}
          onCopyCompactJson={(tabId, offset) => copyNodeDetailAtOffset(tabId, offset, true, 'compact-json')}
          onCopyFormattedJson={(tabId, offset) => copyNodeDetailAtOffset(tabId, offset, true, 'formatted-json')}
          onEditValue={(tabId, offset) => handleOpenEditNodeAtOffset(tabId, offset, true)}
          onRenameKey={(tabId, offset) => applyRightNodeMutationAtOffset(tabId, offset, true, 'rename-node-key')}
          onDeleteValue={(tabId, offset) => applyRightNodeMutationAtOffset(tabId, offset, true, 'delete-node')}
          onUnescapeValue={(tabId, offset) => handleOpenUnescapedNodeAtOffset(tabId, offset, true)}
          t={t}
        />
      )}

      {leftEditorContextMenu && !shouldUseDedicatedLeftViewer && (
        <LeftEditorContextMenu
          contextMenu={leftEditorContextMenu}
          isDarkMode={isDarkMode}
          onClose={() => setLeftEditorContextMenu(null)}
          onCopy={copyLeftEditorSelection}
          onCut={cutLeftEditorSelection}
          onPaste={pasteIntoLeftEditor}
          onSelectAll={selectAllLeftEditorText}
          t={t}
        />
      )}
    </div>
  );
};

export default App;
