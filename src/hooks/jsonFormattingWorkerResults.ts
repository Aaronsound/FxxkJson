import type { MutableRefObject } from 'react';
import { DEDICATED_RIGHT_VIEWER_THRESHOLD, LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type {
  LargeJsonViewerData,
  LargeRawViewerData,
  ProcessingStage,
  StructureStatus,
  WorkerMessage,
} from '../types/jsonTool';
import { measureJsonDocument } from '../utils/jsonDocumentMetrics';
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
  updateFormattedContent: (
    tabId: string,
    content: string,
    syncModel?: boolean,
    byteLength?: number,
    rawByteLength?: number
  ) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean, byteLength?: number) => void;
}

function getDocumentSizeState(rawText: string, formattedText: string) {
  const rawMetrics = measureJsonDocument(rawText);
  const formattedMetrics = measureJsonDocument(formattedText);
  const rawBytes = rawMetrics.textByteLength;
  const formattedBytes = formattedMetrics.textByteLength;
  const hasHighFormattedLineCount =
    formattedBytes < LARGE_FILE_THRESHOLD && formattedMetrics.exceedsDedicatedViewerLineThreshold;

  return {
    formattedBytes,
    largeMode: rawBytes >= LARGE_FILE_THRESHOLD || formattedBytes >= LARGE_FILE_THRESHOLD || hasHighFormattedLineCount,
    rawBytes,
    shouldBuildLargeViewer:
      rawBytes >= DEDICATED_RIGHT_VIEWER_THRESHOLD ||
      formattedBytes >= DEDICATED_RIGHT_VIEWER_THRESHOLD ||
      hasHighFormattedLineCount,
  };
}

interface JsonFormattingWorkerResultContext {
  callbacks: JsonFormattingWorkerResultCallbacks;
  clearFormatWatchdog: (tabId: string) => void;
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
    clearFormatWatchdog,
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
    clearFormatWatchdog(tabId);
    const result = getFormatWorkerResult(message, readWorkerText);
    const data = result.formattedText;

    if (result.isSuccessful && data) {
      const rawText = rawTextByTabRef.current[tabId] ?? '';
      const { formattedBytes, largeMode, rawBytes, shouldBuildLargeViewer } = getDocumentSizeState(rawText, data);
      callbacks.logEvent('format-success', {
        tabId,
        requestId,
        formattedLength: formattedBytes,
      });
      callbacks.setTabFormatting(tabId, false);
      callbacks.setTabLargeMode(tabId, largeMode);
      callbacks.setLargeRawViewerData(tabId, result.rawViewerData);
      callbacks.setLargeViewerStatus(tabId, shouldBuildLargeViewer ? 'building' : 'idle');
      callbacks.setProcessingStage(tabId, getProcessingStage(performanceSession, shouldBuildLargeViewer));
      if (performanceSession?.requestId === requestId) {
        performanceSession.formatCompletedAt = performance.now();
        performanceSession.rightModelStartedAt = performance.now();
        performanceSession.formattedBytes = formattedBytes;
        performanceSession.largeMode = largeMode;
      }
      callbacks.updateFormattedContent(tabId, data, true, formattedBytes, rawBytes);
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
    callbacks.updateFormattedContent(tabId, '', true, 0, performanceSession?.rawBytes);
    callbacks.setTabError(tabId, result.error ?? 'JSON 解析失败');
    callbacks.setStructureStatus(tabId, 'disabled');
    return true;
  }

  if (type === 'repair-result') {
    clearFormatWatchdog(tabId);
    const result = getRepairWorkerResult(message, readWorkerText, readWorkerTextField);
    const { error, formattedText, repairedText } = result;

    if (result.isSuccessful && typeof formattedText === 'string' && typeof repairedText === 'string') {
      const { formattedBytes, largeMode, rawBytes, shouldBuildLargeViewer } = getDocumentSizeState(
        repairedText,
        formattedText
      );
      const now = performance.now();
      callbacks.logEvent('repair-success', {
        tabId,
        requestId,
        repairedLength: rawBytes,
        formattedLength: formattedBytes,
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
        performanceSession.rawBytes = rawBytes;
        performanceSession.formattedBytes = formattedBytes;
        performanceSession.largeMode = largeMode;
      }
      callbacks.updateTabContent(tabId, repairedText, true, rawBytes);
      callbacks.setLargeRawViewerData(tabId, result.rawViewerData);
      callbacks.updateFormattedContent(tabId, formattedText, true, formattedBytes, rawBytes);
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
  const shouldWaitForViewer = Boolean(performanceSession?.largeMode);
  if (!shouldWaitForViewer || performanceSession?.viewerReadyAt) {
    callbacks.setProcessingStage(tabId, 'idle');
  }
  return true;
}
