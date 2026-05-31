import type { PerformanceSnapshot, RightNodeSelection, Tab, TabDocumentMeta } from '../types/jsonTool';
import type { DiagnosticsContextItem } from '../components/DiagnosticsLogPanel';

interface BuildDiagnosticsContextArgs {
  activeDocumentMeta: TabDocumentMeta;
  activeLeftMatchCount: number;
  activePerformanceSnapshot: PerformanceSnapshot | null;
  activeProcessingStage: string;
  activeRightMatchCount: number;
  activeRightNodeSelection: RightNodeSelection | null;
  activeTab: Tab | null;
  currentError: string | null;
  currentStructureStatus: string;
  importingFileName: string | null;
  isFormattingActiveTab: boolean;
  isLargeFileLocateEnabled: boolean;
  isLargeFileMode: boolean;
  leftSearchHasMore: boolean;
  leftSearchTerm: string;
  normalizedLeftMatchIndex: number;
  normalizedRightMatchIndex: number;
  rightSearchHasMore: boolean;
  rightSearchTerm: string;
  shouldUseDedicatedLeftViewer: boolean;
  shouldUseDedicatedRightViewer: boolean;
  usesLightweightLocate: boolean;
}

export function buildDiagnosticsContext({
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
}: BuildDiagnosticsContextArgs): DiagnosticsContextItem[] {
  if (!activeTab) {
    return [];
  }

  return [
    { label: 'tabId', value: activeTab.id },
    { label: 'tabTitle', value: activeTab.title },
    { label: 'rawBytes', value: activeDocumentMeta.rawLength },
    { label: 'formattedBytes', value: activeDocumentMeta.formattedLength },
    { label: 'rawLength', value: activeDocumentMeta.rawLength },
    { label: 'formattedLength', value: activeDocumentMeta.formattedLength },
    { label: 'largeMode', value: isLargeFileMode },
    { label: 'dedicatedLeftViewer', value: shouldUseDedicatedLeftViewer },
    { label: 'dedicatedRightViewer', value: shouldUseDedicatedRightViewer },
    { label: 'largeFileLocateEnabled', value: isLargeFileLocateEnabled },
    { label: 'lightweightLocate', value: usesLightweightLocate },
    { label: 'structureStatus', value: currentStructureStatus },
    { label: 'processingStage', value: activeProcessingStage },
    { label: 'isFormatting', value: isFormattingActiveTab },
    { label: 'importingFileName', value: importingFileName },
    { label: 'currentError', value: currentError },
    { label: 'rightSelectedPath', value: activeRightNodeSelection?.pathText },
    {
      label: 'leftSearch',
      value: leftSearchTerm
        ? `${normalizedLeftMatchIndex + 1}/${activeLeftMatchCount}${leftSearchHasMore ? '+' : ''}`
        : null,
    },
    {
      label: 'rightSearch',
      value: rightSearchTerm
        ? `${normalizedRightMatchIndex + 1}/${activeRightMatchCount}${rightSearchHasMore ? '+' : ''}`
        : null,
    },
    { label: 'performanceTrigger', value: activePerformanceSnapshot?.trigger },
    { label: 'performanceStatus', value: activePerformanceSnapshot?.status },
    { label: 'formatWorkerMs', value: activePerformanceSnapshot?.formatWorkerMs },
    { label: 'viewerIndexMs', value: activePerformanceSnapshot?.viewerIndexMs },
  ];
}
