import type {
  LocateFeedback,
  PerformanceSnapshot,
  ProcessingStage,
  RightNodeSelection,
  StructureStatus,
  Tab,
  TabDocumentMeta,
} from '../types/jsonTool';
import { buildDiagnosticsContext } from '../utils/diagnosticsContext';
import { formatBytes, formatDuration } from '../utils/jsonEditorInteractions';
import { getProcessingStageText } from '../utils/jsonProcessingStage';
import { getRightPaneStatusText } from '../utils/rightPaneStatus';
import type { I18nKey } from '../utils/i18n';
import { getCompactPathLabel } from './useRightSearchQuickAccess';

type JsonToolTranslator = (key: I18nKey, params?: Record<string, string | number>) => string;

interface UseJsonToolDerivedStateArgs {
  activeDocumentMeta: TabDocumentMeta;
  activeLeftMatchCount: number;
  activeLocateFeedback: LocateFeedback | null;
  activePerformanceSnapshot: PerformanceSnapshot | null;
  activeProcessingStage: ProcessingStage;
  activeRightMatchCount: number;
  activeRightNodeSelection: RightNodeSelection | null;
  activeTab: Tab | null;
  canEnableLargeFileLocate: boolean;
  canUseRightPaneFolding: boolean;
  currentError: string | null;
  currentStructureStatus: StructureStatus;
  importingFileName: string | null;
  isFormattingActiveTab: boolean;
  isLargeFileLocateEnabled: boolean;
  isLargeFileMode: boolean;
  leftSearchHasMore: boolean;
  leftSearchTerm: string;
  normalizedLeftMatchIndex: number;
  rightMatchIndex: number;
  rightSearchHasMore: boolean;
  rightSearchTerm: string;
  shouldUseDedicatedLeftViewer: boolean;
  shouldUseDedicatedRightViewer: boolean;
  t: JsonToolTranslator;
  usesLightweightLocate: boolean;
}

export function useJsonToolDerivedState({
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
  t,
  usesLightweightLocate,
}: UseJsonToolDerivedStateArgs) {
  const normalizedRightMatchIndex =
    activeRightMatchCount > 0
      ? ((rightMatchIndex % activeRightMatchCount) + activeRightMatchCount) % activeRightMatchCount
      : 0;
  const processingStageText = getProcessingStageText(activeProcessingStage, importingFileName);
  const leftPaneMetaText = [
    activeDocumentMeta.rawLength > 0 ? `${t('pane.metaMemory')} ${formatBytes(activeDocumentMeta.rawLength)}` : null,
    formatDuration(activePerformanceSnapshot?.readFileMs)
      ? `${t('pane.metaImport')} ${formatDuration(activePerformanceSnapshot?.readFileMs)}`
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
    t,
    usesDedicatedRightViewer: shouldUseDedicatedRightViewer,
    usesLightweightLocate,
  });
  const rightPaneMetaText = [
    activeDocumentMeta.formattedLength > 0
      ? `${t('pane.metaMemory')} ${formatBytes(activeDocumentMeta.formattedLength)}`
      : null,
    formatDuration(activePerformanceSnapshot?.formatWorkerMs)
      ? `${t('pane.metaFormat')} ${formatDuration(activePerformanceSnapshot?.formatWorkerMs)}`
      : null,
    activeRightNodeSelection?.pathText
      ? `${t('pane.metaPath')} ${getCompactPathLabel(activeRightNodeSelection.pathText)}`
      : null,
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

  return {
    diagnosticsContext,
    leftPaneMetaText,
    normalizedRightMatchIndex,
    processingStageText,
    rightPaneMetaText,
  };
}
