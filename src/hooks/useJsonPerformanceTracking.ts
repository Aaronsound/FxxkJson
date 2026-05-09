import { MutableRefObject, useEffect, useRef, useState } from 'react';
import {
  PerformanceSnapshot,
  PerformanceSnapshotStatus,
  PerformanceTrigger,
} from '../types/jsonTool';

export type PerformanceSession = {
  requestId: number | null;
  pendingFormat: boolean;
  trigger: PerformanceTrigger;
  sourceLabel: string;
  fileSizeBytes: number | null;
  rawBytes: number;
  formattedBytes: number;
  largeMode: boolean;
  structureEnabled: boolean;
  startedAt: number;
  readStartedAt?: number;
  readCompletedAt?: number;
  leftModelStartedAt?: number;
  leftModelCompletedAt?: number;
  formatQueuedAt?: number;
  formatStartedAt?: number;
  formatCompletedAt?: number;
  rightModelStartedAt?: number;
  rightModelCompletedAt?: number;
  viewerIndexMs?: number | null;
  viewerReadyAt?: number;
  structureCompletedAt?: number;
  status: PerformanceSnapshotStatus;
  error: string | null;
};

type UseJsonPerformanceTrackingArgs = {
  activeTabIdRef: MutableRefObject<string>;
  initialTabId: string;
};

function measureDuration(start?: number, end?: number) {
  return typeof start === 'number' && typeof end === 'number'
    ? Math.round((end - start) * 10) / 10
    : null;
}

export function useJsonPerformanceTracking({
  activeTabIdRef,
  initialTabId,
}: UseJsonPerformanceTrackingArgs) {
  const [performanceByTab, setPerformanceByTab] = useState<Record<string, PerformanceSnapshot | null>>({
    [initialTabId]: null,
  });
  const performanceSessionsRef = useRef<Record<string, PerformanceSession>>({});

  const logEvent = (event: string, details: Record<string, unknown> = {}) => {
    window.electronAPI?.appendLog(JSON.stringify({
      event,
      activeTabId: activeTabIdRef.current,
      ...details,
    })).catch(() => {
      // Ignore logging failures in the renderer path.
    });
  };

  const syncPerformanceSnapshot = (tabId: string, shouldLog = false) => {
    const session = performanceSessionsRef.current[tabId];
    if (!session) {
      return;
    }

    const snapshot: PerformanceSnapshot = {
      trigger: session.trigger,
      sourceLabel: session.sourceLabel,
      fileSizeBytes: session.fileSizeBytes,
      rawBytes: session.rawBytes,
      formattedBytes: session.formattedBytes,
      largeMode: session.largeMode,
      structureEnabled: session.structureEnabled,
      readFileMs: measureDuration(session.readStartedAt, session.readCompletedAt),
      leftModelSyncMs: measureDuration(session.leftModelStartedAt, session.leftModelCompletedAt),
      formatQueueMs: measureDuration(session.formatQueuedAt, session.formatStartedAt),
      formatWorkerMs: measureDuration(session.formatStartedAt, session.formatCompletedAt),
      rightModelSyncMs: measureDuration(session.rightModelStartedAt, session.rightModelCompletedAt),
      viewerIndexMs: typeof session.viewerIndexMs === 'number'
        ? Math.round(session.viewerIndexMs * 10) / 10
        : null,
      totalToFormattedMs: measureDuration(session.startedAt, session.rightModelCompletedAt),
      totalToViewerReadyMs: measureDuration(session.startedAt, session.viewerReadyAt),
      structureIndexMs: measureDuration(session.formatCompletedAt, session.structureCompletedAt),
      updatedAt: Date.now(),
      status: session.status,
      error: session.error,
    };

    setPerformanceByTab((current) => ({ ...current, [tabId]: snapshot }));

    if (shouldLog) {
      logEvent('performance-snapshot', {
        tabId,
        snapshot,
      });
    }
  };

  const beginPerformanceSession = (
    tabId: string,
    trigger: PerformanceTrigger,
    sourceLabel: string,
    fileSizeBytes: number | null,
    rawBytes: number,
    largeMode: boolean
  ) => {
    performanceSessionsRef.current[tabId] = {
      requestId: null,
      pendingFormat: true,
      trigger,
      sourceLabel,
      fileSizeBytes,
      rawBytes,
      formattedBytes: 0,
      largeMode,
      structureEnabled: false,
      startedAt: performance.now(),
      status: 'running',
      error: null,
    };
    syncPerformanceSnapshot(tabId);
  };

  const mutatePerformanceSession = (
    tabId: string,
    mutate: (session: PerformanceSession) => void,
    shouldLog = false
  ) => {
    const session = performanceSessionsRef.current[tabId];
    if (!session) {
      return;
    }

    mutate(session);
    syncPerformanceSnapshot(tabId, shouldLog);
  };

  const clearPerformanceState = (tabId: string, removeOnly = false) => {
    delete performanceSessionsRef.current[tabId];
    setPerformanceByTab((current) => {
      const next = { ...current };
      if (removeOnly) {
        delete next[tabId];
      } else {
        next[tabId] = null;
      }
      return next;
    });
  };

  useEffect(() => {
    logEvent('renderer-ready');
  }, []);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      logEvent('renderer-window-error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logEvent('renderer-unhandled-rejection', {
        reason: event.reason instanceof Error
          ? { message: event.reason.message, stack: event.reason.stack }
          : String(event.reason),
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return {
    clearPerformanceState,
    beginPerformanceSession,
    logEvent,
    mutatePerformanceSession,
    performanceByTab,
    performanceSessionsRef,
    setPerformanceByTab,
    syncPerformanceSnapshot,
  };
}
