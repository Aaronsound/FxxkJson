import { type MutableRefObject, useEffect } from 'react';
import type { StructureStatus, WorkerMessage } from '../types/jsonTool';
import type { createJsonWorkerInteractiveFlow } from './jsonWorkerInteractiveFlow';
import { handleJsonFormattingWorkerResult } from './jsonFormattingWorkerResults';
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
  performanceSessionsRef: MutableRefObject<Record<string, PerformanceSession>>;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  readWorkerText: (message: WorkerMessage) => string | null;
  readWorkerTextField: (
    message: WorkerMessage,
    textKey: 'data' | 'repairedText',
    bufferKey: 'dataBuffer' | 'repairedTextBuffer'
  ) => string | null;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
  workerRef: MutableRefObject<Worker | null>;
}

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
  performanceSessionsRef,
  rawTextByTabRef,
  readWorkerText,
  readWorkerTextField,
  structureStatusRef,
  workerRef,
}: UseJsonWorkerLifecycleArgs) {
  useEffect(() => {
    const worker = new Worker(new URL('../workers/jsonParser.worker.js', import.meta.url), { type: 'module' });

    workerRef.current = worker;
    worker.onerror = (event) => {
      const message = event.message || 'JSON worker failed to load';
      callbacksRef.current.logEvent('worker-error', {
        message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
      failActiveWorkerRequests({
        callbacksRef,
        clearFormatWatchdog,
        clearPendingFormat,
        latestRequestRef,
        message,
        userMessage: `JSON worker 加载失败：${message}`,
      });
    };
    worker.onmessageerror = () => {
      const message = 'JSON worker message transfer failed';
      callbacksRef.current.logEvent('worker-message-error', {
        message,
      });
      failActiveWorkerRequests({
        callbacksRef,
        clearFormatWatchdog,
        clearPendingFormat,
        latestRequestRef,
        message,
        userMessage: 'JSON worker 消息传输失败，请重试或重新导入文件',
      });
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
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

    return () => {
      Object.keys(formatTimersRef.current).forEach(clearPendingFormat);
      Object.keys(formatWatchdogTimersRef.current).forEach(clearFormatWatchdog);
      callbacksRef.current.clearLeftHighlights();
      callbacksRef.current.clearRightHighlights();
      interactiveFlow.stop();
      worker.terminate();
      workerRef.current = null;
    };
  }, [
    callbacksRef,
    clearFormatWatchdog,
    clearPendingFormat,
    formatWatchdogTimersRef,
    interactiveFlow,
    performanceSessionsRef,
  ]);
}
