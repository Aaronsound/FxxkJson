import type { MutableRefObject } from 'react';
import type { PerformanceSession } from './useJsonPerformanceTracking';

export const FORMAT_WORKER_RESULT_TIMEOUT_MS = 20_000;

export interface JsonWorkerFormatWatchdogCallbacks {
  logEvent: (event: string, details?: Record<string, unknown>) => void;
  mutatePerformanceSession: (tabId: string, mutate: (session: PerformanceSession) => void, shouldLog?: boolean) => void;
  setLargeViewerStatus: (tabId: string, status: 'idle') => void;
  setProcessingStage: (tabId: string, stage: 'idle') => void;
  setTabError: (tabId: string, message: string | null) => void;
  setTabFormatting: (tabId: string, formatting: boolean) => void;
}

interface ScheduleFormatWatchdogArgs {
  callbacksRef: MutableRefObject<JsonWorkerFormatWatchdogCallbacks>;
  clearFormatWatchdog: (tabId: string) => void;
  formatWatchdogTimersRef: MutableRefObject<Record<string, number>>;
  latestRequestRef: MutableRefObject<Record<string, number>>;
  requestId: number;
  stage: 'formatting' | 'repairing';
  tabId: string;
  textLength: number;
}

export function scheduleFormatWatchdog({
  callbacksRef,
  clearFormatWatchdog,
  formatWatchdogTimersRef,
  latestRequestRef,
  requestId,
  stage,
  tabId,
  textLength,
}: ScheduleFormatWatchdogArgs) {
  clearFormatWatchdog(tabId);
  formatWatchdogTimersRef.current[tabId] = window.setTimeout(() => {
    delete formatWatchdogTimersRef.current[tabId];
    if (latestRequestRef.current[tabId] !== requestId) {
      return;
    }

    const errorMessage =
      stage === 'repairing' ? 'JSON 修复超时：Worker 未返回结果' : 'JSON 格式化超时：Worker 未返回结果';
    callbacksRef.current.logEvent(stage === 'repairing' ? 'repair-timeout' : 'format-timeout', {
      tabId,
      requestId,
      textLength,
      timeoutMs: FORMAT_WORKER_RESULT_TIMEOUT_MS,
      error: errorMessage,
    });
    callbacksRef.current.mutatePerformanceSession(
      tabId,
      (session) => {
        if (session.requestId !== requestId) {
          return;
        }

        session.formatCompletedAt = performance.now();
        session.status = 'failed';
        session.error = errorMessage;
      },
      true
    );
    callbacksRef.current.setTabFormatting(tabId, false);
    callbacksRef.current.setProcessingStage(tabId, 'idle');
    callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
    callbacksRef.current.setTabError(tabId, errorMessage);
  }, FORMAT_WORKER_RESULT_TIMEOUT_MS);
}
