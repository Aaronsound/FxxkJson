import React, { useState } from 'react';
import type { OnMount } from '@monaco-editor/react';
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
import { useJsonEditActions } from './hooks/useJsonEditActions';
import { useLeftEditorActions } from './hooks/useLeftEditorActions';
import { useJsonEditorRuntimeEffects } from './hooks/useJsonEditorRuntimeEffects';
import { useRightEditorDiagnostics } from './hooks/useRightEditorDiagnostics';
import { INITIAL_TAB_ID } from './types/jsonTool';
import type { LargeJsonSearchMatch } from './types/jsonTool';
import { getUtf8ByteLength, isLargeDocument } from './utils/jsonDocumentMetrics';
import { APP_VERSION } from './utils/appInfo';
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

  const { clearRightHighlights, logRightEditorState } = useRightEditorDiagnostics({
    activeTabIdRef,
    formattedTextByTabRef,
    largeFileLocateEnabledRef,
    largeModeRef,
    logEvent,
    rawTextByTabRef,
    rightDecorationIdsRef,
    rightEditorRef,
    structureStatusRef,
  });
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

  usePreserveActiveTabViewState({
    activeTabId,
    leftEditorRef,
    leftViewStateByTabRef,
    previousActiveTabIdRef,
    rightEditorRef,
    rightViewStateByTabRef,
  });

  useJsonEditorRuntimeEffects({
    activeDocumentMeta,
    activeLargeViewerData,
    activeLargeViewerStatus,
    activeTab,
    activeTabId,
    activeTabIdRef,
    formattedTextByTabRef,
    getTabContent,
    isBuildingDedicatedRightViewer,
    isLargeFileMode,
    leftEditorRef,
    logRightEditorState,
    rightEditorRef,
    shouldEnableRightPaneFolding,
    shouldUseDedicatedLeftViewer,
    shouldUseDedicatedRightViewer,
    syncLeftModel,
    syncRightModel,
    wrapLongLines,
  });

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

  const { handleLeftChange, handleLeftMount, replaceAllLeftText, replaceCurrentLargeLeftText } = useLeftEditorActions({
    activeTab,
    activeTabIdRef,
    beginPastePerformanceSession(tabId, nextContent) {
      beginPerformanceSession(
        tabId,
        'paste',
        '剪贴板粘贴',
        null,
        getUtf8ByteLength(nextContent),
        isLargeDocument(nextContent)
      );
    },
    getTabContent,
    largeRawViewerMatches,
    leftEditorRef,
    normalizedLeftMatchIndex,
    openLeftFind,
    queueFormat,
    registerLeftEditorContextMenu,
    renameTab,
    requestReplaceText: ({ tabId, text, searchTerm, searchOptions, replacement }) =>
      requestWorkerEditJson({
        tabId,
        operation: 'replace-text',
        text,
        searchTerm,
        searchOptions,
        replacement,
      }),
    resetSearchState,
    resetTabArtifacts,
    setTabError,
    setTabLargeMode,
    shouldUseDedicatedLeftViewer,
    suppressLeftChangeRef,
    syncLeftModel,
    updateTabContent,
  });

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

  const { handleCopyEscapedJson, handleEscapeEditJsonContent, handleSaveEditJson, handleUnescapeEditJsonContent } =
    useJsonEditActions({
      activeTab,
      beginPerformanceSession,
      closeEditJson,
      editJsonSession,
      editJsonValueRef,
      getTabContent,
      mutatePerformanceSession,
      queueFormatAfterEditSave,
      requestWorkerEditJson,
      requestWorkerEditJsonResult,
      resetSearchState,
      setEditJsonBusyLabel,
      setEditJsonError,
      setLargeRawViewerData,
      setLargeViewerData,
      setLargeViewerStatus,
      setProcessingStage,
      setStructureStatus,
      setTabFormatting,
      setTabLargeMode,
      showCopyLiteralNotice,
      updateFormattedContent,
      updateTabContent,
      workerStructureEnabledRef,
    });

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
