import { MutableRefObject, useEffect } from 'react';
import type { StructureStatus, WorkerMessage } from '../types/jsonTool';
import { createJsonWorkerInteractiveFlow } from './jsonWorkerInteractiveFlow';
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
  clearPendingFormat: (tabId: string) => void;
  formatTimersRef: MutableRefObject<Record<string, number>>;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
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

export function useJsonWorkerLifecycle({
  callbacksRef,
  clearPendingFormat,
  formatTimersRef,
  formattedTextByTabRef,
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
      callbacksRef.current.logEvent('worker-error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };
    worker.onmessageerror = () => {
      callbacksRef.current.logEvent('worker-message-error');
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (interactiveFlow.handleResult(event.data)) {
        return;
      }

      handleJsonFormattingWorkerResult(event.data, {
        callbacks: callbacksRef.current,
        formattedTextByTabRef,
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
      callbacksRef.current.clearLeftHighlights();
      callbacksRef.current.clearRightHighlights();
      interactiveFlow.stop();
      worker.terminate();
      workerRef.current = null;
    };
  }, [callbacksRef, clearPendingFormat, formattedTextByTabRef, interactiveFlow, performanceSessionsRef]);
}
