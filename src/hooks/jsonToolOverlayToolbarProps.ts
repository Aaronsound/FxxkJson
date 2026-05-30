import { APP_VERSION } from '../utils/appInfo';
import type { JsonToolWorkspaceInput } from './createJsonToolWorkspaceProps';

export function createJsonToolOverlayProps(input: JsonToolWorkspaceInput) {
  const {
    activeTab,
    cancelMutationDialog,
    closeEditJson,
    confirmDeleteDialog,
    confirmRenameDialog,
    diagnosticsContext,
    editJsonBusyLabel,
    editJsonError,
    editJsonSession,
    editJsonValueRef,
    getTabContent,
    handleCopyEscapedJson,
    handleEscapeEditJsonContent,
    handleOpenAbout,
    handleSaveEditJson,
    handleUnescapeEditJsonContent,
    hasCopiedLiteral,
    isAboutOpen,
    isArchitectureWarningDismissed,
    isCompareOpen,
    isDarkMode,
    isDiagnosticsLogOpen,
    isDragImportActive,
    rightNodeMutationDialog,
    runtimeInfo,
    setIsAboutOpen,
    setIsArchitectureWarningDismissed,
    setIsCompareOpen,
    setIsDiagnosticsLogOpen,
    t,
    tabs,
  } = input;

  return {
    activeTabId: activeTab.id,
    diagnosticsContext,
    editJsonBusyLabel,
    editJsonError,
    editJsonSession,
    getTabText: getTabContent,
    hasCopiedLiteral,
    isAboutOpen,
    isArchitectureWarningDismissed,
    isCompareOpen,
    isDarkMode,
    isDiagnosticsLogOpen,
    isDragImportActive,
    onCancelMutationDialog: cancelMutationDialog,
    onCloseAbout: () => setIsAboutOpen(false),
    onCloseCompare: () => setIsCompareOpen(false),
    onCloseDiagnosticsLog: () => setIsDiagnosticsLogOpen(false),
    onCloseEditJson: closeEditJson,
    onConfirmDeleteMutationDialog: confirmDeleteDialog,
    onConfirmRenameMutationDialog: confirmRenameDialog,
    onCopyEscapedJson: handleCopyEscapedJson,
    onDismissArchitectureWarning: () => setIsArchitectureWarningDismissed(true),
    onEditJsonValueChange: (value: string) => {
      editJsonValueRef.current = value;
    },
    onEscapeEditJsonContent: handleEscapeEditJsonContent,
    onOpenAbout: handleOpenAbout,
    onSaveEditJson: handleSaveEditJson,
    onUnescapeEditJsonContent: handleUnescapeEditJsonContent,
    rightNodeMutationDialog,
    runtimeInfo,
    tabs,
    t,
    version: APP_VERSION,
  };
}

export function createJsonToolToolbarProps(input: JsonToolWorkspaceInput) {
  const {
    canCompareJson,
    canControlRightPaneFolding,
    canEditJson,
    canEnableLargeFileLocate,
    currentError,
    currentStructureStatus,
    handleClear,
    handleEscapeJson,
    handleFormat,
    handleImport,
    handleLargeFileLocateToggle,
    handleOpenAbout,
    handleOpenCompare,
    handleOpenDiagnosticsLog,
    handleOpenEditJson,
    handleRepairJson,
    handleToggleDarkMode,
    handleUnescapeJson,
    importingFileName,
    isDarkMode,
    isLargeFileLocateEnabled,
    isLargeFileMode,
    language,
    largeViewerRef,
    processingStageText,
    setLanguage,
    setShowPerformancePanel,
    setWrapLongLines,
    shouldUseDedicatedRightViewer,
    showPerformancePanel,
    t,
    usesLightweightLocate,
    wrapLongLines,
  } = input;

  return {
    onImport: handleImport,
    onFormat: handleFormat,
    onRepairJson: handleRepairJson,
    onUnescapeJson: handleUnescapeJson,
    onEscapeJson: handleEscapeJson,
    onClear: handleClear,
    onEditJson: handleOpenEditJson,
    onOpenCompare: handleOpenCompare,
    onOpenDiagnosticsLog: handleOpenDiagnosticsLog,
    onOpenAbout: handleOpenAbout,
    onFoldAll: () => {
      if (shouldUseDedicatedRightViewer) {
        largeViewerRef.current?.foldAll();
        return;
      }
      input.rightEditorRef.current?.getAction('editor.foldAll')?.run();
    },
    onUnfoldAll: () => {
      if (shouldUseDedicatedRightViewer) {
        largeViewerRef.current?.unfoldAll();
        return;
      }
      input.rightEditorRef.current?.getAction('editor.unfoldAll')?.run();
    },
    canControlRightPaneFolding,
    isLargeFileMode,
    canEditJson,
    canCompareJson,
    wrapLongLines,
    onWrapLongLinesChange: setWrapLongLines,
    isDarkMode,
    onToggleDarkMode: handleToggleDarkMode,
    isLargeFileLocateEnabled,
    onLargeFileLocateToggle: handleLargeFileLocateToggle,
    showPerformancePanel,
    onShowPerformancePanelChange: setShowPerformancePanel,
    importingFileName,
    canEnableLargeFileLocate,
    usesLightweightLocate,
    currentStructureStatus,
    processingStageText,
    currentError,
    language,
    onLanguageChange: setLanguage,
    t,
  };
}
