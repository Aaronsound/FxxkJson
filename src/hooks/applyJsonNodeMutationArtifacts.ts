import type { MutableRefObject } from 'react';
import type {
  LargeJsonViewerData,
  LargeRawViewerData,
  ProcessingStage,
  StructureStatus,
  WorkerMessage,
} from '../types/jsonTool';
import { resolveJsonDocumentMetrics } from '../utils/jsonDocumentMetrics';
import type { PerformanceSession } from './useJsonPerformanceTracking';

interface ApplyJsonNodeMutationArtifactsArgs {
  largeMode: boolean;
  mutatePerformanceSession: (tabId: string, mutate: (session: PerformanceSession) => void, shouldLog?: boolean) => void;
  rawByteLength: number;
  result: WorkerMessage;
  setLargeRawViewerData: (tabId: string, data: LargeRawViewerData | null) => void;
  setLargeViewerData: (tabId: string, data: LargeJsonViewerData | null) => void;
  setLargeViewerStatus: (tabId: string, status: 'idle' | 'building' | 'ready') => void;
  setProcessingStage: (tabId: string, stage: ProcessingStage) => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
  setTabFormatting: (tabId: string, formatting: boolean) => void;
  tabId: string;
  updateFormattedContent: (
    tabId: string,
    content: string,
    syncModel?: boolean,
    byteLength?: number,
    rawByteLength?: number
  ) => void;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
}

export function applyJsonNodeMutationArtifacts({
  largeMode,
  mutatePerformanceSession,
  rawByteLength,
  result,
  setLargeRawViewerData,
  setLargeViewerData,
  setLargeViewerStatus,
  setProcessingStage,
  setStructureStatus,
  setTabFormatting,
  tabId,
  updateFormattedContent,
  workerStructureEnabledRef,
}: ApplyJsonNodeMutationArtifactsArgs) {
  if (typeof result.formattedText !== 'string') {
    return false;
  }

  const formattedMetrics = resolveJsonDocumentMetrics(result.formattedText, result.formattedMetrics);
  const rightModelStartedAt = performance.now();
  updateFormattedContent(tabId, result.formattedText, true, formattedMetrics.textByteLength, rawByteLength);
  const rightModelCompletedAt = performance.now();
  setLargeRawViewerData(tabId, result.rawViewerData ?? null);
  setLargeViewerData(tabId, result.viewerData ?? null);
  setLargeViewerStatus(tabId, result.viewerData ? 'ready' : 'idle');
  setStructureStatus(
    tabId,
    result.structureWarming
      ? 'building'
      : workerStructureEnabledRef.current[tabId]
        ? 'ready'
        : largeMode
          ? 'disabled'
          : 'ready'
  );
  setProcessingStage(tabId, result.structureWarming ? 'building-index' : 'idle');
  setTabFormatting(tabId, false);
  mutatePerformanceSession(
    tabId,
    (session) => {
      session.pendingFormat = false;
      session.requestId = null;
      session.formatQueuedAt = rightModelStartedAt;
      session.formatStartedAt = rightModelStartedAt;
      session.formatCompletedAt = rightModelStartedAt;
      session.rightModelStartedAt = rightModelStartedAt;
      session.rightModelCompletedAt = rightModelCompletedAt;
      session.formattedBytes = formattedMetrics.textByteLength;
      session.viewerIndexMs = typeof result.viewerIndexMs === 'number' ? result.viewerIndexMs : null;
      session.viewerReadyAt = rightModelCompletedAt;
      session.structureCompletedAt = rightModelCompletedAt;
      session.structureEnabled = Boolean(workerStructureEnabledRef.current[tabId]);
      session.status = 'ready';
      session.error = null;
    },
    true
  );
  return true;
}
