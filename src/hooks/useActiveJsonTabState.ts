import {
  EMPTY_DOCUMENT_META,
  LARGE_FILE_THRESHOLD,
  STRUCTURE_SYNC_THRESHOLD,
  type LargeJsonViewerData,
  type LargeRawViewerData,
  type LocateFeedback,
  type PerformanceSnapshot,
  type ProcessingStage,
  type RightNodeSelection,
  type StructureStatus,
  type Tab,
  type TabDocumentMeta,
} from '../types/jsonTool';

interface UseActiveJsonTabStateArgs {
  activeTabId: string;
  documentMetaByTab: Record<string, TabDocumentMeta>;
  errorsByTab: Record<string, string | null>;
  formattedTextByTab: Record<string, string>;
  importingByTab: Record<string, string | null>;
  isFormattingByTab: Record<string, boolean>;
  largeFileLocateEnabledByTab: Record<string, boolean>;
  largeModeByTab: Record<string, boolean>;
  largeRawViewerDataByTab: Record<string, LargeRawViewerData | null>;
  largeViewerCollapsedLinesByTab: Record<string, number[]>;
  largeViewerDataByTab: Record<string, LargeJsonViewerData | null>;
  largeViewerStatusByTab: Record<string, 'idle' | 'building' | 'ready'>;
  locateFeedbackByTab: Record<string, LocateFeedback | null>;
  performanceByTab: Record<string, PerformanceSnapshot | null>;
  processingStageByTab: Record<string, ProcessingStage>;
  rawTextByTab: Record<string, string>;
  rightNodeSelectionByTab: Record<string, RightNodeSelection | null>;
  structureStatusByTab: Record<string, StructureStatus>;
  tabs: Tab[];
}

export function useActiveJsonTabState({
  activeTabId,
  documentMetaByTab,
  errorsByTab,
  formattedTextByTab,
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
  rawTextByTab,
  rightNodeSelectionByTab,
  structureStatusByTab,
  tabs,
}: UseActiveJsonTabStateArgs) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const activeDocumentMeta = activeTab ? (documentMetaByTab[activeTab.id] ?? EMPTY_DOCUMENT_META) : EMPTY_DOCUMENT_META;
  const activeRawText = activeTab ? (rawTextByTab[activeTab.id] ?? '') : '';
  const formattedValue = activeTab ? (formattedTextByTab[activeTab.id] ?? '') : '';
  const currentError = activeTab ? (errorsByTab[activeTab.id] ?? null) : null;
  const importingFileName = activeTab ? (importingByTab[activeTab.id] ?? null) : null;
  const isFormattingActiveTab = activeTab ? Boolean(isFormattingByTab[activeTab.id]) : false;
  const isLargeFileMode = activeTab
    ? Boolean(
        largeModeByTab[activeTab.id] ||
          activeDocumentMeta.rawLength >= LARGE_FILE_THRESHOLD ||
          activeDocumentMeta.formattedLength >= LARGE_FILE_THRESHOLD
      )
    : false;
  const currentStructureStatus = activeTab ? (structureStatusByTab[activeTab.id] ?? 'ready') : 'ready';
  const activeProcessingStage = activeTab ? (processingStageByTab[activeTab.id] ?? 'idle') : 'idle';
  const activeLocateFeedback = activeTab ? (locateFeedbackByTab[activeTab.id] ?? null) : null;
  const activeRightNodeSelection = activeTab ? (rightNodeSelectionByTab[activeTab.id] ?? null) : null;
  const activeRightSelectedRange = activeRightNodeSelection
    ? {
        start: activeRightNodeSelection.startOffset,
        end: activeRightNodeSelection.endOffset,
      }
    : null;
  const isLargeFileLocateEnabled = activeTab ? Boolean(largeFileLocateEnabledByTab[activeTab.id]) : false;
  const canEnableLargeFileLocate = activeTab ? activeDocumentMeta.rawLength > 0 : false;
  const usesLightweightLocate = activeTab ? activeDocumentMeta.rawLength > STRUCTURE_SYNC_THRESHOLD : false;
  const canEditJson = Boolean(activeRawText.trim());
  const canUseRightPaneFolding = activeTab
    ? activeDocumentMeta.rawLength > 0 && activeDocumentMeta.rawLength <= STRUCTURE_SYNC_THRESHOLD
    : false;
  const shouldEnableRightPaneFolding = activeTab ? activeDocumentMeta.rawLength <= STRUCTURE_SYNC_THRESHOLD : true;
  const activePerformanceSnapshot = activeTab ? (performanceByTab[activeTab.id] ?? null) : null;
  const activeLargeViewerData = activeTab ? (largeViewerDataByTab[activeTab.id] ?? null) : null;
  const activeLargeRawViewerData = activeTab ? (largeRawViewerDataByTab[activeTab.id] ?? null) : null;
  const activeLargeViewerStatus = activeTab ? (largeViewerStatusByTab[activeTab.id] ?? 'idle') : 'idle';
  const activeLargeViewerCollapsedLines = activeTab ? (largeViewerCollapsedLinesByTab[activeTab.id] ?? []) : [];
  const shouldUseDedicatedRightViewer = Boolean(activeLargeViewerData && formattedValue);
  const shouldUseDedicatedLeftViewer = Boolean(activeRawText && activeDocumentMeta.rawLength >= LARGE_FILE_THRESHOLD);
  const isBuildingDedicatedRightViewer = Boolean(
    formattedValue && !shouldUseDedicatedRightViewer && activeLargeViewerStatus === 'building'
  );

  return {
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
    isImportingActiveTab: Boolean(importingFileName),
    isLargeFileLocateEnabled,
    isLargeFileMode,
    shouldEnableRightPaneFolding,
    shouldUseDedicatedLeftViewer,
    shouldUseDedicatedRightViewer,
    usesLightweightLocate,
  };
}
