import type React from 'react';
import type { OnMount } from '@monaco-editor/react';
import JsonToolAppView from './components/JsonToolAppView';
import { useLeftEditorContextMenu } from './hooks/useLeftEditorContextMenu';
import { useJsonToolContentActions } from './hooks/useJsonToolContentActions';
import { useJsonToolDialogs } from './hooks/useJsonToolDialogs';
import { useJsonToolRefs, usePreserveActiveTabViewState } from './hooks/useJsonToolRefs';
import { useJsonToolTabActions } from './hooks/useJsonToolTabActions';
import { useJsonEditSession } from './hooks/useJsonEditSession';
import { useJsonFormattingWorker } from './hooks/useJsonFormattingWorker';
import { useJsonPerformanceTracking } from './hooks/useJsonPerformanceTracking';
import { useRightNodeSelectionHighlight } from './hooks/useRightNodeSelectionHighlight';
import { useDismissRightNodeSelection } from './hooks/useDismissRightNodeSelection';
import { useJsonToolTabsState } from './hooks/useJsonToolTabsState';
import { useJsonTabArtifacts } from './hooks/useJsonTabArtifacts';
import { useJsonToolPaneSearchStates } from './hooks/useJsonToolPaneSearchStates';
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
import { useJsonToolViewerState } from './hooks/useJsonToolViewerState';
import { useJsonToolWorkspaceActions } from './hooks/useJsonToolWorkspaceActions';
import { createJsonToolWorkspaceProps } from './hooks/createJsonToolWorkspaceProps';
import { INITIAL_TAB_ID } from './types/jsonTool';
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
  const {
    isLeftFindOpen,
    isLeftSearchLoadingMore,
    isRightFindOpen,
    isRightSearchLoadingMore,
    leftMatchIndex,
    leftMatches,
    leftSearchHasMore,
    leftSearchNextOffset,
    leftSearchOptions,
    leftSearchTerm,
    resetLeftSearchPaging,
    resetLeftSearchState,
    resetRightSearchPaging,
    resetRightSearchState,
    rightMatchIndex,
    rightMatches,
    rightSearchHasMore,
    rightSearchNextOffset,
    rightSearchOptions,
    rightSearchTerm,
    setIsLeftFindOpen,
    setIsLeftSearchLoadingMore,
    setIsRightFindOpen,
    setIsRightSearchLoadingMore,
    setLeftMatchIndex,
    setLeftMatches,
    setLeftSearchHasMore,
    setLeftSearchNextOffset,
    setLeftSearchOptions,
    setLeftSearchTerm,
    setRightMatchIndex,
    setRightMatches,
    setRightSearchHasMore,
    setRightSearchNextOffset,
    setRightSearchOptions,
    setRightSearchTerm,
  } = useJsonToolPaneSearchStates();
  const {
    largeViewerMatchCount,
    largeViewerMatches,
    leftReplaceText,
    setLargeViewerMatchCount,
    setLargeViewerMatches,
    setLeftReplaceText,
  } = useJsonToolViewerState();
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
    largeViewerFoldStateByTab,
    largeViewerDataByTab,
    largeViewerStatusByTab,
    locateFeedbackByTab,
    processingStageByTab,
    removeTabArtifactsState,
    rightNodeSelectionByTab,
    setLargeRawViewerDataByTab,
    setLargeViewerFoldStateByTab,
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
    activeLargeViewerFoldState,
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
    ...{ activeTabId, documentMetaByTab, errorsByTab },
    formattedTextByTab: formattedTextByTabRef.current,
    ...{ importingByTab, isFormattingByTab, largeFileLocateEnabledByTab, largeModeByTab },
    ...{ largeRawViewerDataByTab, largeViewerFoldStateByTab, largeViewerDataByTab, largeViewerStatusByTab },
    ...{ locateFeedbackByTab, performanceByTab, processingStageByTab },
    rawTextByTab: rawTextByTabRef.current,
    ...{ rightNodeSelectionByTab, structureStatusByTab, tabs },
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
      ...{ activeDocumentMeta, activeLeftMatchCount, activeLocateFeedback, activePerformanceSnapshot },
      ...{ activeProcessingStage, activeRightMatchCount, activeRightNodeSelection, activeTab },
      ...{ canEnableLargeFileLocate, canUseRightPaneFolding, currentError, currentStructureStatus },
      ...{ importingFileName, isFormattingActiveTab, isLargeFileLocateEnabled, isLargeFileMode },
      ...{ leftSearchHasMore, leftSearchTerm, normalizedLeftMatchIndex },
      ...{ rightMatchIndex, rightSearchHasMore, rightSearchTerm },
      ...{ shouldUseDedicatedLeftViewer, shouldUseDedicatedRightViewer, usesLightweightLocate },
      t,
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
    ...{ activeTabIdRef, largeModeRef, largeViewerDataByTab, largeViewerStatusByTab },
    ...{ leftEditorRef, leftViewStateByTabRef, logEvent, logRightEditorState },
    ...{ rawTextByTabRef, rightEditorRef, rightViewStateByTabRef, suppressLeftChangeRef },
  });

  const {
    getFormattedContent,
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
    ...{ clearLeftHighlights, clearRightHighlights },
    ...{ formattedTextByTabRef, largeFileLocateEnabledRef, largeModeRef, largeViewerMatches, rawTextByTabRef },
    ...{ resetLeftSearchState, resetRightSearchPaging, resetRightSearchState },
    ...{ setDocumentMeta, setIsRightSearchLoadingMore, setLargeFileLocateEnabledState },
    ...{ setLargeRawViewerDataByTab, setLargeRawViewerMatches, setLargeViewerFoldStateByTab },
    ...{ setLargeViewerDataByTab, setLargeViewerMatchCount, setLargeViewerMatches, setLargeViewerStatusByTab },
    ...{ setLeftReplaceText, setLocateFeedbackByTab, setProcessingStageByTab, setRightNodeSelectionByTab },
    ...{ setRightSearchHasMore, setRightSearchNextOffset, setStructureStatusState, setTabLargeModeState },
    ...{ structureStatusRef, syncLeftModel, syncRightModel },
  });

  const {
    clearTabStructure,
    importJsonFile,
    importJsonText,
    queueFormat,
    queueRepair,
    queueFormatAfterEditSave,
    releaseTransientWorkerCaches,
    removeTabArtifacts,
    requestWorkerSearch,
    requestWorkerLocate,
    requestWorkerEditJson,
    requestWorkerEditJsonResult,
    resetTabArtifacts,
  } = useJsonFormattingWorker({
    ...{
      activeTabIdRef,
      largeModeRef,
      largeFileLocateEnabledRef,
      leftSearchWorkerRevisionRef,
      leftViewStateByTabRef,
      rightViewStateByTabRef,
    },
    ...{ structureStatusRef, workerStructureEnabledRef, rawTextByTabRef, formattedTextByTabRef },
    ...{ performanceSessionsRef, beginPerformanceSession, clearPerformanceState },
    ...{ logEvent, mutatePerformanceSession, syncPerformanceSnapshot },
    ...{ renameTab, removeTabState, setTabError, setTabImporting, setTabFormatting },
    ...{ setTabLargeMode, setProcessingStage, setLocateFeedback, setRightNodeSelection, setStructureStatus },
    ...{ setLargeViewerData, setLargeRawViewerData, setLargeViewerStatus, setLargeViewerSearchResults },
    ...{ setLeftSearchResults, updateTabContent, updateFormattedContent },
    ...{ resetSearchState, revealLeftRange, clearLeftHighlights, clearRightHighlights },
  });

  const { pinActiveRightPath, selectRightPinnedPath, toggleRightFoldAtOffset } = useRightPaneNavigationActions({
    ...{ activeRightNodeSelection, activeTab, activeTabIdRef, getPinnedPath, largeViewerRef },
    ...{ pinRightPath, requestWorkerLocate, rightEditorRef, setRightNodeSelection, shouldUseDedicatedRightViewer },
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
    onDeactivateTab: releaseTransientWorkerCaches,
    previousActiveTabIdRef,
    rightEditorRef,
    rightViewStateByTabRef,
  });

  const closeEditJsonWithCacheRelease = () => {
    releaseTransientWorkerCaches(activeTabIdRef.current);
    closeEditJson();
  };

  useJsonEditorRuntimeEffects({
    ...{ activeDocumentMeta, activeLargeViewerData, activeLargeViewerStatus, activeTab, activeTabId, activeTabIdRef },
    ...{ formattedTextByTabRef, getTabContent, isBuildingDedicatedRightViewer, isLargeFileMode },
    ...{ logRightEditorState, shouldEnableRightPaneFolding },
    ...{ shouldUseDedicatedRightViewer, syncLeftModel, syncRightModel, wrapLongLines },
  });

  const { closeLeftFind, closeRightFind, openLeftFind, openRightFind } = useJsonToolSearchEffects({
    ...{ activeDocumentMeta, activeLargeViewerData, activeTab, activeTabId },
    ...{ clearLeftHighlights, clearRightHighlights, getTabContent, isBuildingDedicatedRightViewer },
    ...{ largeRawViewerRef, largeViewerRef, leftEditorRef, leftSearchWorkerRevisionRef },
    ...{ leftSearchOptions, leftSearchTerm, rememberRightSearchTerm, requestWorkerSearch },
    ...{ resetLeftSearchState, resetRightSearchState, resetSearchState },
    ...{ rightDecorationIdsRef, rightEditorRef, rightMatchIndex, rightSearchOptions, rightSearchTerm },
    ...{ setIsLeftFindOpen, setIsLeftSearchLoadingMore, setIsRightFindOpen, setIsRightSearchLoadingMore },
    ...{ setLargeRawViewerMatches, setLargeViewerMatchCount, setLargeViewerMatches },
    ...{ setLeftMatches, setLeftSearchHasMore, setLeftSearchNextOffset },
    ...{ setRightMatches, setRightSearchHasMore, setRightSearchNextOffset },
    ...{ shouldUseDedicatedLeftViewer, shouldUseDedicatedRightViewer },
  });

  useRightNodeSelectionHighlight({
    editorRef: rightEditorRef,
    isDisabled: shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer,
    selection: activeRightNodeSelection,
  });
  useDismissRightNodeSelection({
    activeTabId: activeTab?.id ?? null,
    hasSelection: Boolean(activeRightNodeSelection),
    onDismiss: (tabId) => setRightNodeSelection(tabId, null),
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

  const {
    applyRawUpdate,
    beginPastePerformanceSession,
    handleOpenAbout,
    handleOpenCompare,
    handleOpenDiagnosticsLog,
    handleToggleDarkMode,
  } = useJsonToolWorkspaceActions({
    beginPerformanceSession,
    setIsAboutOpen,
    setIsCompareOpen,
    setIsDarkMode,
    setIsDiagnosticsLogOpen,
    setTabLargeMode,
    updateTabContent,
  });

  const { handleLeftChange, handleLeftMount, replaceAllLeftText, replaceCurrentLargeLeftText } = useLeftEditorActions({
    ...{ activeTab, activeTabIdRef },
    beginPastePerformanceSession,
    ...{ getTabContent, largeRawViewerMatches, leftEditorRef, normalizedLeftMatchIndex, openLeftFind },
    rawTextByteLength: activeDocumentMeta.rawLength,
    ...{ queueFormat, registerLeftEditorContextMenu, renameTab },
    requestReplaceText: ({ tabId, text, textByteLength, searchTerm, searchOptions, replacement }) =>
      requestWorkerEditJson({
        tabId,
        operation: 'replace-text',
        text,
        textByteLength,
        searchTerm,
        searchOptions,
        replacement,
      }),
    ...{ resetSearchState, resetTabArtifacts, setTabError, setTabLargeMode },
    ...{ shouldUseDedicatedLeftViewer, suppressLeftChangeRef, syncLeftModel, updateTabContent },
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
    ...{ activeDocumentMeta, activeTab, beginPerformanceSession, clearPerformanceState, clearTabStructure },
    ...{ getFormattedContent, getTabContent },
    ...{ largeModeRef, leftEditorRef, leftSearchWorkerRevisionRef, openDocumentEditSession },
    ...{ queueFormat, queueRepair, renameTab, requestWorkerEditJson },
    ...{ resetSearchState, resetTabArtifacts, setEditJsonBusyLabel },
    ...{ setLargeFileLocateEnabled, setStructureStatus, setTabError, setTabLargeMode, updateTabContent },
  });

  const { handleOpenEditNodeAtOffset, handleOpenUnescapedNodeAtOffset, readEditableNodeAtOffset } =
    useRightNodeEditOpeners({
      formattedTextByTabRef,
      openNodeEditSession,
      requestWorkerEditJson,
      setEditJsonBusyLabel,
      setTabError,
    });

  const {
    applyNodeMutationArtifacts,
    handleCopyEscapedJson,
    handleEscapeEditJsonContent,
    handleSaveEditJson,
    handleUnescapeEditJsonContent,
  } = useJsonEditActions({
    activeTab,
    beginPerformanceSession,
    closeEditJson: closeEditJsonWithCacheRelease,
    editJsonSession,
    editJsonValueRef,
    ...{ getFormattedContent, getTabContent, mutatePerformanceSession, queueFormatAfterEditSave },
    getLargeViewerData: (tabId) => largeViewerDataByTab[tabId] ?? null,
    ...{ requestWorkerEditJson, requestWorkerEditJsonResult, resetSearchState },
    ...{ setEditJsonBusyLabel, setEditJsonError, setLargeRawViewerData, setLargeViewerData },
    ...{ setLargeViewerStatus, setProcessingStage, setStructureStatus },
    ...{ setTabFormatting, setTabLargeMode, showCopyLiteralNotice },
    ...{ updateFormattedContent, updateTabContent, workerStructureEnabledRef },
  });

  const { applyRightNodeMutationAtOffset, copyNodeDetailAtOffset, copyValueAtOffset } = useRightNodeActions({
    applyNodeMutationArtifacts,
    applyRawUpdate,
    ...{ getTabContent, logEvent, queueFormatAfterEditSave, readEditableNodeAtOffset, requestWorkerEditJsonResult },
    requestDeleteConfirmation: requestDeleteNode,
    requestRenameKey,
    ...{ resetSearchState, setEditJsonBusyLabel, setTabError },
  });

  const { addTab, closeTab } = useJsonToolTabActions({
    ...{ activeTabId, activeTabIdRef, formattedTextByTabRef, handleClear },
    ...{ initializeTabArtifacts, initializeTabState, largeFileLocateEnabledRef, largeModeRef },
    ...{ leftEditorRef, leftSearchWorkerRevisionRef, leftViewStateByTabRef, rawTextByTabRef },
    ...{ removeTabArtifacts, removeTabArtifactsState, rightEditorRef, rightViewStateByTabRef },
    ...{ setActiveTabId, setPerformanceByTab, setTabs, structureStatusRef, tabs, workerStructureEnabledRef },
  });

  const handleRightMount: OnMount = useRightEditorActions({
    ...{ activeTabIdRef, applyRightNodeMutationAtOffset, copyNodeDetailAtOffset, copyValueAtOffset },
    ...{ formattedTextByTabRef, handleOpenEditNodeAtOffset, handleOpenUnescapedNodeAtOffset, largeModeRef },
    ...{ logRightEditorState, openRightFind, requestWorkerLocate, rightContextMenuOffsetByTabRef },
    ...{ rightEditorRef, rightViewStateByTabRef, setRightEditorContextMenu },
    ...{ structureStatusRef, syncRightModel, workerStructureEnabledRef, wrapLongLines },
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
    ...{ activeDocumentMeta, activeLeftMatchCount, activeRightMatchCount, activeTab },
    ...{ isBuildingDedicatedRightViewer, isLeftSearchLoadingMore, isRightSearchLoadingMore },
    ...{ leftEditorRef, leftMatches, leftReplaceText, leftSearchHasMore },
    ...{ leftSearchNextOffset, leftSearchOptions, leftSearchTerm, normalizedLeftMatchIndex },
    replaceCurrentLeftText: (searchTerm, searchOptions, replacement) => {
      void replaceCurrentLargeLeftText(searchTerm, searchOptions, replacement);
    },
    replaceAllLeftText: (searchTerm, searchOptions, replacement) => {
      void replaceAllLeftText(searchTerm, searchOptions, replacement);
    },
    ...{ requestWorkerSearch, resetLeftSearchPaging, resetRightSearchPaging, rightDecorationIdsRef },
    ...{ rightEditorRef, rightMatchIndex, rightMatches, rightSearchHasMore },
    ...{ rightSearchNextOffset, rightSearchOptions, rightSearchTerm },
    ...{ setIsLeftSearchLoadingMore, setIsRightSearchLoadingMore, setLargeViewerMatchCount },
    ...{ setLargeViewerMatches, setLeftMatchIndex, setLeftSearchOptions, setLeftSearchTerm },
    ...{ setRightMatchIndex, setRightMatches, setRightSearchHasMore, setRightSearchNextOffset },
    ...{ setRightSearchOptions, setRightSearchTerm, shouldUseDedicatedRightViewer },
  });

  if (!activeTab) {
    return null;
  }

  const workspaceProps = createJsonToolWorkspaceProps({
    ...{ activeDocumentMeta, activeLargeRawViewerData, activeLargeViewerFoldState, activeLargeViewerData },
    ...{ activeLeftMatchCount, activePerformanceSnapshot, activeRawText, activeRightMatchCount },
    ...{ activeRightPinnedPathItems, activeRightSelectedRange },
    activeTab,
    activeTabId,
    ...{ addTab, applyRightNodeMutationAtOffset },
    canCompareJson: tabs.length >= 2,
    ...{ canControlRightPaneFolding, canEditJson, canEnableLargeFileLocate },
    ...{ cancelMutationDialog, cancelRenaming, closeLeftFind, closeRightFind, closeTab },
    closeEditJson: closeEditJsonWithCacheRelease,
    ...{ confirmDeleteDialog, confirmRenameDialog },
    ...{ copyLeftEditorSelection, copyNodeDetailAtOffset, copyValueAtOffset, cutLeftEditorSelection },
    ...{ currentError, currentStructureStatus, diagnosticsContext },
    ...{ editJsonBusyLabel, editJsonError, editJsonSession, editJsonValueRef },
    ...{ finishRenaming, formattedValue, getTabContent },
    ...{ gotoNextLeft, gotoNextRight, gotoPrevLeft, gotoPrevRight },
    ...{ handleClear, handleCopyEscapedJson, handleEscapeEditJsonContent, handleEscapeJson },
    ...{ handleFormat, handleImport, handleLargeFileLocateToggle },
    ...{ handleLeftChange, handleLeftMount, handleLeftSearchOptionsChange, handleLeftSearchTermChange },
    handleOpenAbout,
    handleOpenCompare,
    handleOpenDiagnosticsLog,
    ...{ handleOpenEditJson, handleOpenEditNodeAtOffset, handleOpenUnescapedNodeAtOffset },
    ...{ handleRepairJson, handleRenamingChange, handleRightMount },
    ...{ handleRightSearchOptionsChange, handleRightSearchTermChange, handleSaveEditJson },
    handleToggleDarkMode,
    ...{ handleUnescapeEditJsonContent, handleUnescapeJson, hasCopiedLiteral, importingFileName },
    ...{ isAboutOpen, isArchitectureWarningDismissed, isBuildingDedicatedRightViewer, isCompareOpen },
    ...{ isDarkMode, isDiagnosticsLogOpen, isDragImportActive, isFormattingActiveTab, isImportingActiveTab },
    ...{ isLargeFileLocateEnabled, isLargeFileMode, isLeftFindOpen, isLeftSearchLoadingMore },
    ...{ isRightFindOpen, isRightSearchLoadingMore, language },
    ...{ largeRawViewerRef, largeViewerMatches, largeViewerRef, leftEditorContextMenu },
    ...{ leftPaneMetaText, leftRawHighlightRange, leftReplaceText },
    ...{ leftSearchHasMore, leftSearchOptions, leftSearchTerm },
    ...{ loadMoreLeftSearch, loadMoreRightSearch, normalizedLeftMatchIndex, normalizedRightMatchIndex },
    ...{ openRightFind, pasteIntoLeftEditor, performanceHistory, pinActiveRightPath, processingStageText },
    ...{ rememberRightSearchTerm, renamingTab, replaceAllLeftMatches, replaceLeftMatch, requestWorkerLocate },
    ...{ rightEditorContextMenu, rightEditorRef, rightMatchIndex, rightNodeMutationDialog, rightPaneMetaText },
    ...{ rightRecentSearches, rightSearchHasMore, rightSearchOptions, rightSearchTerm, runtimeInfo },
    ...{ selectAllLeftEditorText, selectRightPinnedPath },
    ...{ setActiveTabId, setIsAboutOpen, setIsArchitectureWarningDismissed, setIsCompareOpen },
    ...{ setIsDiagnosticsLogOpen, setIsRightFindOpen, setLanguage, setLargeViewerFoldStateByTab },
    ...{ setLargeViewerMatchCount, setLeftEditorContextMenu, setLeftReplaceText, setRightEditorContextMenu },
    ...{ setRightMatchIndex, setRightSearchTerm, setShowPerformancePanel, setWrapLongLines },
    ...{ shouldEnableRightPaneFolding, shouldUseDedicatedLeftViewer, shouldUseDedicatedRightViewer },
    ...{
      showPerformancePanel,
      startRenamingTab,
      t,
      tabs,
      toggleRightFoldAtOffset,
      usesLightweightLocate,
      wrapLongLines,
    },
  });

  return (
    <JsonToolAppView
      fileInputRef={fileInputRef}
      isDarkMode={isDarkMode}
      onDragEnter={handleImportDragEnter}
      onDragOver={handleImportDragOver}
      onDragLeave={handleImportDragLeave}
      onDrop={handleImportDrop}
      onFileSelection={handleFileSelection}
      shouldShowPerformancePanel={showPerformancePanel}
      workspaceProps={workspaceProps}
    />
  );
};

export default App;
