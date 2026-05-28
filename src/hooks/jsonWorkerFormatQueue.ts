import { MutableRefObject } from 'react';
import { EDIT_SAVE_FORMAT_DELAY_MS, FORMAT_DEBOUNCE_MS, LARGE_FILE_FORMAT_DEBOUNCE_MS } from '../types/jsonTool';
import type { StructureStatus, WorkerRequestMessage, WorkerRequestTextPayload } from '../types/jsonTool';
import { getUtf8ByteLength, shouldUseLargeMode } from '../utils/jsonDocumentMetrics';
import { buildJsonWorkerProcessingPlan } from '../utils/jsonWorkerPlan';
import type { PerformanceSession } from './useJsonPerformanceTracking';

interface JsonWorkerFormatQueueCallbacks {
  logEvent: (event: string, details?: Record<string, unknown>) => void;
  mutatePerformanceSession: (tabId: string, mutate: (session: PerformanceSession) => void, shouldLog?: boolean) => void;
  setLargeRawViewerData: (tabId: string, data: null) => void;
  setLargeViewerData: (tabId: string, data: null) => void;
  setLargeViewerStatus: (tabId: string, status: 'idle' | 'building') => void;
  setLocateFeedback: (tabId: string, feedback: null) => void;
  setProcessingStage: (tabId: string, stage: 'idle' | 'formatting' | 'repairing') => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
  setTabError: (tabId: string, message: string | null) => void;
  setTabFormatting: (tabId: string, formatting: boolean) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  updateFormattedContent: (tabId: string, content: string, syncModel?: boolean) => void;
}

interface CreateJsonWorkerFormatQueueArgs {
  callbacksRef: MutableRefObject<JsonWorkerFormatQueueCallbacks>;
  cancelInteractiveRequests: (tabId: string) => void;
  clearPendingFormat: (tabId: string) => void;
  clearTabStructure: (tabId: string, status?: StructureStatus) => void;
  createWorkerTextPayload: (
    text: string,
    byteLength?: number
  ) => {
    message: WorkerRequestTextPayload;
    transfer: Transferable[];
  };
  formatTimersRef: MutableRefObject<Record<string, number>>;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  latestRequestRef: MutableRefObject<Record<string, number>>;
  postWorkerRequest: (message: WorkerRequestMessage, transfer?: Transferable[]) => void;
  requestCounterRef: MutableRefObject<number>;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
}

export function createJsonWorkerFormatQueue({
  callbacksRef,
  cancelInteractiveRequests,
  clearPendingFormat,
  clearTabStructure,
  createWorkerTextPayload,
  formatTimersRef,
  largeFileLocateEnabledRef,
  largeModeRef,
  latestRequestRef,
  postWorkerRequest,
  requestCounterRef,
  workerStructureEnabledRef,
}: CreateJsonWorkerFormatQueueArgs) {
  const prepareFormatRun = (tabId: string, text: string, stage: 'formatting' | 'repairing') => {
    const locateRequested = Boolean(largeFileLocateEnabledRef.current[tabId]);
    const plan = buildJsonWorkerProcessingPlan(text, locateRequested);
    const requestId = ++requestCounterRef.current;

    latestRequestRef.current[tabId] = requestId;
    if (largeModeRef.current[tabId] !== plan.largeMode) {
      callbacksRef.current.setTabLargeMode(tabId, plan.largeMode);
    }

    callbacksRef.current.setTabFormatting(tabId, true);
    callbacksRef.current.setProcessingStage(tabId, stage);
    callbacksRef.current.setLocateFeedback(tabId, null);
    callbacksRef.current.setLargeViewerData(tabId, null);
    callbacksRef.current.setLargeRawViewerData(tabId, null);
    callbacksRef.current.setLargeViewerStatus(tabId, plan.shouldBuildLargeViewer ? 'building' : 'idle');
    workerStructureEnabledRef.current[tabId] = plan.workerLocateEnabled;
    callbacksRef.current.setStructureStatus(
      tabId,
      plan.workerLocateEnabled ? 'building' : plan.largeMode ? 'disabled' : 'ready'
    );

    return { plan, requestId };
  };

  const queueFormat = (tabId: string, text: string, immediate = false) => {
    clearPendingFormat(tabId);
    callbacksRef.current.setTabError(tabId, null);
    cancelInteractiveRequests(tabId);

    if (!text.trim()) {
      callbacksRef.current.mutatePerformanceSession(
        tabId,
        (session) => {
          if (session.pendingFormat) {
            session.pendingFormat = false;
          }
          session.requestId = null;
          session.rawBytes = getUtf8ByteLength(text);
          session.formattedBytes = 0;
          session.status = 'ready';
          session.error = null;
        },
        true
      );
      callbacksRef.current.setTabFormatting(tabId, false);
      callbacksRef.current.setTabLargeMode(tabId, false);
      callbacksRef.current.setProcessingStage(tabId, 'idle');
      callbacksRef.current.setLocateFeedback(tabId, null);
      callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
      callbacksRef.current.setLargeViewerData(tabId, null);
      callbacksRef.current.setLargeRawViewerData(tabId, null);
      clearTabStructure(tabId, 'ready');
      callbacksRef.current.updateFormattedContent(tabId, '', true);
      return;
    }

    const { plan, requestId } = prepareFormatRun(tabId, text, 'formatting');
    callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
      if (!session.pendingFormat) {
        return;
      }

      session.pendingFormat = false;
      session.requestId = requestId;
      session.largeMode = plan.largeMode;
      session.structureEnabled = plan.workerLocateEnabled;
      session.formatQueuedAt = performance.now();
      session.formatStartedAt = undefined;
      session.formatCompletedAt = undefined;
      session.rightModelStartedAt = undefined;
      session.rightModelCompletedAt = undefined;
      session.viewerIndexMs = null;
      session.viewerReadyAt = undefined;
      session.structureCompletedAt = undefined;
      session.formattedBytes = 0;
      session.status = 'running';
      session.error = null;
    });
    callbacksRef.current.logEvent('format-queued', {
      tabId,
      requestId,
      textLength: plan.textByteLength,
      immediate,
      largeMode: plan.largeMode,
      workerStructureEnabled: plan.shouldBuildStructureIndex,
      workerStructureDeferred: plan.shouldDeferStructureIndex,
      workerDirectLocateEnabled: plan.shouldAttemptDirectLocate,
      workerStructureWarmupDelayMs: plan.deferredStructureWarmupDelayMs,
    });

    const run = () => {
      callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
        if (session.requestId !== requestId) {
          return;
        }

        session.formatStartedAt = performance.now();
      });
      callbacksRef.current.logEvent('format-start', {
        tabId,
        requestId,
        textLength: plan.textByteLength,
      });
      const textPayload = createWorkerTextPayload(text, plan.textByteLength);
      postWorkerRequest(
        {
          type: 'format',
          requestId,
          tabId,
          enableStructure: plan.shouldBuildStructureIndex,
          enableDirectLocate: plan.shouldAttemptDirectLocate,
          deferStructure: plan.shouldDeferStructureIndex,
          buildViewer: plan.shouldBuildLargeViewer,
          structureWarmupDelayMs: plan.deferredStructureWarmupDelayMs,
          ...textPayload.message,
        },
        textPayload.transfer
      );
    };

    if (immediate) {
      run();
      return;
    }

    formatTimersRef.current[tabId] = window.setTimeout(
      run,
      plan.largeMode ? LARGE_FILE_FORMAT_DEBOUNCE_MS : FORMAT_DEBOUNCE_MS
    );
  };

  const queueRepair = (tabId: string, text: string) => {
    clearPendingFormat(tabId);
    callbacksRef.current.setTabError(tabId, null);
    cancelInteractiveRequests(tabId);

    if (!text.trim()) {
      callbacksRef.current.setTabError(tabId, '没有可修复的 JSON 内容');
      return;
    }

    const { plan, requestId } = prepareFormatRun(tabId, text, 'repairing');
    callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
      if (!session.pendingFormat) {
        return;
      }

      session.pendingFormat = false;
      session.requestId = requestId;
      session.largeMode = plan.largeMode;
      session.structureEnabled = plan.workerLocateEnabled;
      session.formatQueuedAt = performance.now();
      session.formatStartedAt = performance.now();
      session.formatCompletedAt = undefined;
      session.rightModelStartedAt = undefined;
      session.rightModelCompletedAt = undefined;
      session.viewerIndexMs = null;
      session.viewerReadyAt = undefined;
      session.structureCompletedAt = undefined;
      session.formattedBytes = 0;
      session.status = 'running';
      session.error = null;
    });
    callbacksRef.current.logEvent('repair-start', {
      tabId,
      requestId,
      textLength: plan.textByteLength,
      largeMode: plan.largeMode,
      workerStructureEnabled: plan.shouldBuildStructureIndex,
      workerStructureDeferred: plan.shouldDeferStructureIndex,
      workerDirectLocateEnabled: plan.shouldAttemptDirectLocate,
      workerStructureWarmupDelayMs: plan.deferredStructureWarmupDelayMs,
    });

    const textPayload = createWorkerTextPayload(text, plan.textByteLength);
    postWorkerRequest(
      {
        type: 'repair',
        requestId,
        tabId,
        enableStructure: plan.shouldBuildStructureIndex,
        enableDirectLocate: plan.shouldAttemptDirectLocate,
        deferStructure: plan.shouldDeferStructureIndex,
        buildViewer: plan.shouldBuildLargeViewer,
        structureWarmupDelayMs: plan.deferredStructureWarmupDelayMs,
        ...textPayload.message,
      },
      textPayload.transfer
    );
  };

  const queueFormatAfterUiUpdate = (tabId: string, text: string, delayMs = 0) => {
    clearPendingFormat(tabId);
    formatTimersRef.current[tabId] = window.setTimeout(() => {
      delete formatTimersRef.current[tabId];
      queueFormat(tabId, text, true);
    }, delayMs);
  };

  return {
    queueFormat,
    queueFormatAfterEditSave(tabId: string, text: string) {
      queueFormatAfterUiUpdate(tabId, text, shouldUseLargeMode(text) ? EDIT_SAVE_FORMAT_DELAY_MS : 0);
    },
    queueFormatAfterImport(tabId: string, text: string) {
      queueFormatAfterUiUpdate(tabId, text);
    },
    queueRepair,
  };
}
