import { type MutableRefObject, useEffect } from 'react';
import type { StructureStatus, WorkerMessage } from '../types/jsonTool';
import type { createJsonWorkerInteractiveFlow } from './jsonWorkerInteractiveFlow';
import { clearAllPendingFormattedViewerResults, handleJsonFormattingWorkerResult } from './jsonFormattingWorkerResults';
import type { PerformanceSession } from './useJsonPerformanceTracking';

type JsonFormattingWorkerResultCallbacks = Parameters<typeof handleJsonFormattingWorkerResult>[1]['callbacks'];

interface JsonWorkerLifecycleCallbacks extends JsonFormattingWorkerResultCallbacks {
  clearLeftHighlights: () => void;
  clearRightHighlights: () => void;
  logEvent: (event: string, details?: Record<string, unknown>) => void;
}

interface UseJsonWorkerLifecycleArgs {
  callbacksRef: MutableRefObject<JsonWorkerLifecycleCallbacks>;
  clearFormatWatchdog: (tabId: string) => void;
  clearPendingFormat: (tabId: string) => void;
  formatWatchdogTimersRef: MutableRefObject<Record<string, number>>;
  formatTimersRef: MutableRefObject<Record<string, number>>;
  interactiveFlow: ReturnType<typeof createJsonWorkerInteractiveFlow>;
  latestRequestRef: MutableRefObject<Record<string, number>>;
  onViewerCacheEvicted: (tabId: string) => void;
  onViewerCacheRestored: (tabId: string) => void;
  onWorkerRestarted: () => void;
  performanceSessionsRef: MutableRefObject<Record<string, PerformanceSession>>;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  readWorkerText: (message: WorkerMessage) => string | null;
  readWorkerTextField: (
    message: WorkerMessage,
    textKey: 'data' | 'repairedText' | 'formattedText',
    bufferKey: 'dataBuffer' | 'repairedTextBuffer' | 'formattedTextBuffer'
  ) => string | null;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
  recoverFormatRequests: (tabIds: string[]) => void;
  workerRef: MutableRefObject<Worker | null>;
}

const WORKER_RESTART_DELAY_MS = 60;
const MAX_AUTOMATIC_WORKER_RESTARTS = 2;

interface FailActiveWorkerRequestsArgs {
  callbacksRef: MutableRefObject<JsonWorkerLifecycleCallbacks>;
  clearFormatWatchdog: (tabId: string) => void;
  clearPendingFormat: (tabId: string) => void;
  latestRequestRef: MutableRefObject<Record<string, number>>;
  message: string;
  userMessage: string;
}

function failActiveWorkerRequests({
  callbacksRef,
  clearFormatWatchdog,
  clearPendingFormat,
  latestRequestRef,
  message,
  userMessage,
}: FailActiveWorkerRequestsArgs) {
  for (const tabId of Object.keys(latestRequestRef.current)) {
    clearPendingFormat(tabId);
    clearFormatWatchdog(tabId);
    callbacksRef.current.setTabFormatting(tabId, false);
    callbacksRef.current.setProcessingStage(tabId, 'idle');
    callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
    callbacksRef.current.setStructureStatus(tabId, 'disabled');
    callbacksRef.current.setTabError(tabId, userMessage);
    callbacksRef.current.mutatePerformanceSession(
      tabId,
      (session) => {
        if (session.requestId !== latestRequestRef.current[tabId]) {
          return;
        }

        session.status = 'failed';
        session.error = message;
      },
      true
    );
  }
}

export function useJsonWorkerLifecycle({
  callbacksRef,
  clearFormatWatchdog,
  clearPendingFormat,
  formatWatchdogTimersRef,
  formatTimersRef,
  interactiveFlow,
  latestRequestRef,
  onViewerCacheEvicted,
  onViewerCacheRestored,
  onWorkerRestarted,
  performanceSessionsRef,
  rawTextByTabRef,
  readWorkerText,
  readWorkerTextField,
  recoverFormatRequests,
  structureStatusRef,
  workerRef,
}: UseJsonWorkerLifecycleArgs) {
  useEffect(() => {
    let disposed = false;
    let activeWorker: Worker | null = null;
    let restartAttempts = 0;
    let restartTimer: number | null = null;
    let pendingRecoveryTabs: string[] = [];

    const startWorker = (isRestart: boolean) => {
      if (disposed) {
        return;
      }

      const worker = new Worker(new URL('../workers/jsonParser.worker.js', import.meta.url), { type: 'module' });
      activeWorker = worker;
      workerRef.current = worker;
      if (isRestart) {
        callbacksRef.current.logEvent('worker-restarted', { attempt: restartAttempts });
        onWorkerRestarted();
        interactiveFlow.resumeEditsAfterRestart();
        const recoveryTabs = pendingRecoveryTabs;
        pendingRecoveryTabs = [];
        window.setTimeout(() => recoverFormatRequests(recoveryTabs), 0);
      }

      const restartWorker = (message: string, userMessage: string, details: Record<string, unknown>) => {
        if (disposed || activeWorker !== worker) {
          return;
        }

        const { event: eventName, ...logDetails } = details;
        callbacksRef.current.logEvent(eventName as string, { ...logDetails, message });
        pendingRecoveryTabs = Array.from(
          new Set([
            ...pendingRecoveryTabs,
            ...Object.keys(performanceSessionsRef.current).filter(
              (tabId) =>
                performanceSessionsRef.current[tabId]?.status === 'running' && Boolean(rawTextByTabRef.current[tabId])
            ),
          ])
        );
        failActiveWorkerRequests({
          callbacksRef,
          clearFormatWatchdog,
          clearPendingFormat,
          latestRequestRef,
          message,
          userMessage,
        });
        clearAllPendingFormattedViewerResults();
        interactiveFlow.suspendForRestart();
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.onmessage = null;
        worker.terminate();
        activeWorker = null;
        workerRef.current = null;

        if (restartAttempts >= MAX_AUTOMATIC_WORKER_RESTARTS) {
          callbacksRef.current.logEvent('worker-restart-exhausted', {
            attempts: restartAttempts,
            message,
          });
          interactiveFlow.stop();
          return;
        }

        restartAttempts += 1;
        restartTimer = window.setTimeout(() => {
          restartTimer = null;
          startWorker(true);
        }, WORKER_RESTART_DELAY_MS);
      };

      worker.onerror = (event) => {
        restartWorker(event.message || 'JSON worker failed to load', 'JSON Worker 异常，正在自动恢复', {
          event: 'worker-error',
          source: event.filename,
          line: event.lineno,
          column: event.colno,
        });
      };
      worker.onmessageerror = () => {
        restartWorker('JSON worker message transfer failed', 'JSON Worker 通信异常，正在自动恢复', {
          event: 'worker-message-error',
        });
      };
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        restartAttempts = 0;
        if (event.data.type === 'viewer-cache-evicted') {
          onViewerCacheEvicted(event.data.tabId);
          return;
        }
        if (event.data.type === 'viewer-cache-restored') {
          onViewerCacheRestored(event.data.tabId);
          return;
        }
        if (event.data.type === 'viewer-ready') {
          onViewerCacheRestored(event.data.tabId);
        }
        if (interactiveFlow.handleResult(event.data)) {
          return;
        }

        handleJsonFormattingWorkerResult(event.data, {
          callbacks: callbacksRef.current,
          clearFormatWatchdog,
          latestRequestRef,
          performanceSessionsRef,
          rawTextByTabRef,
          readWorkerText,
          readWorkerTextField,
          structureStatusRef,
        });
      };
    };

    startWorker(false);

    return () => {
      disposed = true;
      if (restartTimer !== null) {
        window.clearTimeout(restartTimer);
      }
      Object.keys(formatTimersRef.current).forEach(clearPendingFormat);
      Object.keys(formatWatchdogTimersRef.current).forEach(clearFormatWatchdog);
      clearAllPendingFormattedViewerResults();
      callbacksRef.current.clearLeftHighlights();
      callbacksRef.current.clearRightHighlights();
      interactiveFlow.stop();
      activeWorker?.terminate();
      activeWorker = null;
      workerRef.current = null;
    };
  }, [
    callbacksRef,
    clearFormatWatchdog,
    clearPendingFormat,
    formatWatchdogTimersRef,
    interactiveFlow,
    onViewerCacheEvicted,
    onViewerCacheRestored,
    onWorkerRestarted,
    performanceSessionsRef,
    recoverFormatRequests,
  ]);
}
