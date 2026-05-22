import type { MutableRefObject } from 'react';
import type {
  LargeJsonViewerData,
  LargeRawViewerData,
  ProcessingStage,
  StructureStatus,
  WorkerMessage,
} from '../types/jsonTool';
import { getUtf8ByteLength, shouldUseDedicatedRightViewer, shouldUseLargeMode } from '../utils/jsonDocumentMetrics';
import { getFormatWorkerResult, getRepairWorkerResult } from '../utils/jsonWorkerResponse';
import type { PerformanceSession } from './useJsonPerformanceTracking';

interface JsonFormattingWorkerResultCallbacks {
  logEvent: (event: string, details?: Record<string, unknown>) => void;
  mutatePerformanceSession: (tabId: string, mutate: (session: PerformanceSession) => void, shouldLog?: boolean) => void;
  resetSearchState: () => void;
  setLargeRawViewerData: (tabId: string, data: LargeRawViewerData | null) => void;
  setLargeViewerData: (tabId: string, data: LargeJsonViewerData | null) => void;
  setLargeViewerStatus: (tabId: string, status: 'idle' | 'building' | 'ready') => void;
  setLocateFeedback: (tabId: string, feedback: null) => void;
  setProcessingStage: (tabId: string, stage: ProcessingStage) => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
  setTabError: (tabId: string, message: string | null) => void;
  setTabFormatting: (tabId: string, formatting: boolean) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  syncPerformanceSnapshot: (tabId: string, shouldLog?: boolean) => void;
  updateFormattedContent: (tabId: string, content: string, syncModel?: boolean) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean) => void;
}

interface JsonFormattingWorkerResultContext {
  callbacks: JsonFormattingWorkerResultCallbacks;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  latestRequestRef: MutableRefObject<Record<string, number>>;
  performanceSessionsRef: MutableRefObject<Record<string, PerformanceSession>>;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  readWorkerText: (message: WorkerMessage) => string | null;
  readWorkerTextField: (
    message: WorkerMessage,
    stringKey: 'data' | 'repairedText',
    bufferKey: 'dataBuffer' | 'repairedTextBuffer'
  ) => string | null;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
}

function clearFailedResultArtifacts(callbacks: JsonFormattingWorkerResultCallbacks, tabId: string) {
  callbacks.setTabFormatting(tabId, false);
  callbacks.setProcessingStage(tabId, 'idle');
  callbacks.setLocateFeedback(tabId, null);
  callbacks.setLargeViewerStatus(tabId, 'idle');
  callbacks.setLargeViewerData(tabId, null);
  callbacks.setLargeRawViewerData(tabId, null);
}

function getProcessingStage(performanceSession: PerformanceSession | undefined, shouldBuildLargeViewer: boolean) {
  if (shouldBuildLargeViewer) {
    return 'building-viewer';
  }

  return performanceSession?.structureEnabled ? 'building-index' : 'idle';
}

export function handleJsonFormattingWorkerResult(message: WorkerMessage, context: JsonFormattingWorkerResultContext) {
  const { requestId, tabId, type } = message;
  const {
    callbacks,
    formattedTextByTabRef,
    latestRequestRef,
    performanceSessionsRef,
    rawTextByTabRef,
    readWorkerText,
    readWorkerTextField,
    structureStatusRef,
  } = context;

  if (!['format-result', 'repair-result', 'viewer-ready', 'structure-ready'].includes(type)) {
    return false;
  }

  if (latestRequestRef.current[tabId] !== requestId) {
    return true;
  }

  const performanceSession = performanceSessionsRef.current[tabId];

  if (type === 'format-result') {
    const result = getFormatWorkerResult(message, readWorkerText);
    const data = result.formattedText;

    if (result.isSuccessful && data) {
      const rawText = rawTextByTabRef.current[tabId] ?? '';
      const largeMode = shouldUseLargeMode(rawText, data);
      const shouldBuildLargeViewer = shouldUseDedicatedRightViewer(rawText, data);
      callbacks.logEvent('format-success', {
        tabId,
        requestId,
        formattedLength: getUtf8ByteLength(data),
      });
      callbacks.setTabFormatting(tabId, false);
      callbacks.setTabLargeMode(tabId, largeMode);
      callbacks.setLargeRawViewerData(tabId, result.rawViewerData);
      callbacks.setLargeViewerStatus(tabId, shouldBuildLargeViewer ? 'building' : 'idle');
      callbacks.setProcessingStage(tabId, getProcessingStage(performanceSession, shouldBuildLargeViewer));
      if (performanceSession?.requestId === requestId) {
        performanceSession.formatCompletedAt = performance.now();
        performanceSession.rightModelStartedAt = performance.now();
        performanceSession.formattedBytes = getUtf8ByteLength(data);
        performanceSession.largeMode = largeMode;
      }
      callbacks.updateFormattedContent(tabId, data, true);
      if (performanceSession?.requestId === requestId) {
        performanceSession.rightModelCompletedAt = performance.now();
        performanceSession.status = performanceSession.structureEnabled ? 'running' : 'ready';
        performanceSession.error = null;
        callbacks.syncPerformanceSnapshot(tabId, !performanceSession.structureEnabled);
      }
      callbacks.setTabError(tabId, null);
      return true;
    }

    clearFailedResultArtifacts(callbacks, tabId);
    callbacks.mutatePerformanceSession(
      tabId,
      (session) => {
        if (session.requestId !== requestId) {
          return;
        }

        session.formatCompletedAt = performance.now();
        session.status = 'failed';
        session.error = result.error ?? 'JSON parse failed';
      },
      true
    );
    callbacks.logEvent('format-failed', {
      tabId,
      requestId,
      error: result.error ?? 'JSON parse failed',
    });
    callbacks.updateFormattedContent(tabId, '', true);
    callbacks.setTabError(tabId, result.error ?? 'JSON 解析失败');
    callbacks.setStructureStatus(tabId, 'disabled');
    return true;
  }

  if (type === 'repair-result') {
    const result = getRepairWorkerResult(message, readWorkerText, readWorkerTextField);
    const { error, formattedText, repairedText } = result;

    if (result.isSuccessful && typeof formattedText === 'string' && typeof repairedText === 'string') {
      const largeMode = shouldUseLargeMode(repairedText, formattedText);
      const shouldBuildLargeViewer = shouldUseDedicatedRightViewer(repairedText, formattedText);
      const now = performance.now();
      callbacks.logEvent('repair-success', {
        tabId,
        requestId,
        repairedLength: getUtf8ByteLength(repairedText),
        formattedLength: getUtf8ByteLength(formattedText),
      });
      callbacks.setTabFormatting(tabId, false);
      callbacks.setTabLargeMode(tabId, largeMode);
      callbacks.setLargeViewerStatus(tabId, shouldBuildLargeViewer ? 'building' : 'idle');
      callbacks.setProcessingStage(tabId, getProcessingStage(performanceSession, shouldBuildLargeViewer));
      if (performanceSession?.requestId === requestId) {
        performanceSession.leftModelStartedAt = now;
        performanceSession.leftModelCompletedAt = now;
        performanceSession.formatCompletedAt = now;
        performanceSession.rightModelStartedAt = performance.now();
        performanceSession.rawBytes = getUtf8ByteLength(repairedText);
        performanceSession.formattedBytes = getUtf8ByteLength(formattedText);
        performanceSession.largeMode = largeMode;
      }
      callbacks.updateTabContent(tabId, repairedText, true);
      callbacks.setLargeRawViewerData(tabId, result.rawViewerData);
      callbacks.updateFormattedContent(tabId, formattedText, true);
      callbacks.resetSearchState();
      if (performanceSession?.requestId === requestId) {
        performanceSession.rightModelCompletedAt = performance.now();
        performanceSession.status = performanceSession.structureEnabled ? 'running' : 'ready';
        performanceSession.error = null;
        callbacks.syncPerformanceSnapshot(tabId, !performanceSession.structureEnabled);
      }
      callbacks.setTabError(tabId, null);
      return true;
    }

    clearFailedResultArtifacts(callbacks, tabId);
    callbacks.mutatePerformanceSession(
      tabId,
      (session) => {
        if (session.requestId !== requestId) {
          return;
        }

        session.formatCompletedAt = performance.now();
        session.status = 'failed';
        session.error = error ?? 'JSON repair failed';
      },
      true
    );
    callbacks.logEvent('repair-failed', {
      tabId,
      requestId,
      error: error ?? 'JSON repair failed',
    });
    callbacks.setTabError(tabId, error ? `修复失败：${error}` : 'JSON 修复失败');
    callbacks.setStructureStatus(tabId, 'disabled');
    return true;
  }

  if (type === 'viewer-ready') {
    if (performanceSession?.requestId === requestId) {
      performanceSession.viewerIndexMs = typeof message.viewerIndexMs === 'number' ? message.viewerIndexMs : null;
      performanceSession.viewerReadyAt = performance.now();
      if (!performanceSession.structureEnabled) {
        performanceSession.status = 'ready';
      }
      callbacks.syncPerformanceSnapshot(tabId, !performanceSession.structureEnabled);
    }

    callbacks.setLargeViewerData(tabId, message.viewerData ?? null);
    callbacks.setLargeViewerStatus(tabId, message.viewerData ? 'ready' : 'idle');
    callbacks.setProcessingStage(
      tabId,
      performanceSession?.structureEnabled && structureStatusRef.current[tabId] === 'building'
        ? 'building-index'
        : 'idle'
    );
    return true;
  }

  callbacks.mutatePerformanceSession(
    tabId,
    (session) => {
      if (session.requestId !== requestId) {
        return;
      }

      session.structureCompletedAt = performance.now();
      session.status = 'ready';
    },
    true
  );
  callbacks.setStructureStatus(tabId, message.ready ? 'ready' : 'disabled');
  const rawText = rawTextByTabRef.current[tabId] ?? '';
  const formattedText = formattedTextByTabRef.current[tabId] ?? '';
  const shouldWaitForViewer = shouldUseDedicatedRightViewer(rawText, formattedText);
  if (!shouldWaitForViewer || Boolean(performanceSession?.viewerReadyAt)) {
    callbacks.setProcessingStage(tabId, 'idle');
  }
  return true;
}
