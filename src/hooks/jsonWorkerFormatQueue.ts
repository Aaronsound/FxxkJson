import type { MutableRefObject } from 'react';
import type { StructureStatus, WorkerRequestMessage, WorkerRequestTextPayload } from '../types/jsonTool';
import { EDIT_SAVE_FORMAT_DELAY_MS, FORMAT_DEBOUNCE_MS, LARGE_FILE_FORMAT_DEBOUNCE_MS } from '../types/jsonTool';
import {
  getUtf8ByteLength,
  type JsonDocumentMetrics,
  measureJsonDocument,
  shouldUseLargeModeForMetrics,
} from '../utils/jsonDocumentMetrics';
import { buildJsonWorkerProcessingPlan, type JsonWorkerProcessingPlan } from '../utils/jsonWorkerPlan';
import { scheduleFormatWatchdog } from './jsonWorkerFormatWatchdog';
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
  updateFormattedContent: (
    tabId: string,
    content: string,
    syncModel?: boolean,
    byteLength?: number,
    rawByteLength?: number
  ) => void;
}

interface CreateJsonWorkerFormatQueueArgs {
  callbacksRef: MutableRefObject<JsonWorkerFormatQueueCallbacks>;
  clearFormatWatchdog: (tabId: string) => void;
  cancelInteractiveRequests: (tabId: string) => void;
  clearPendingFormat: (tabId: string) => void;
  clearTabCache: (tabId: string, status?: StructureStatus) => void;
  createWorkerTextPayload: (
    text: string,
    byteLength?: number
  ) => {
    message: WorkerRequestTextPayload;
    transfer: Transferable[];
  };
  formatWatchdogTimersRef: MutableRefObject<Record<string, number>>;
  formatTimersRef: MutableRefObject<Record<string, number>>;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  latestRequestRef: MutableRefObject<Record<string, number>>;
  postWorkerRequest: (message: WorkerRequestMessage, transfer?: Transferable[]) => void;
  requestCounterRef: MutableRefObject<number>;
  rawRevisionByTabRef: MutableRefObject<Record<string, number>>;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
}

type JsonFormatPreparation = JsonDocumentMetrics | JsonWorkerProcessingPlan;

function isProcessingPlan(preparation: JsonFormatPreparation): preparation is JsonWorkerProcessingPlan {
  return 'largeMode' in preparation;
}

export function createJsonWorkerFormatQueue({
  callbacksRef,
  clearFormatWatchdog,
  cancelInteractiveRequests,
  clearPendingFormat,
  clearTabCache,
  createWorkerTextPayload,
  formatWatchdogTimersRef,
  formatTimersRef,
  largeFileLocateEnabledRef,
  largeModeRef,
  latestRequestRef,
  postWorkerRequest,
  requestCounterRef,
  rawRevisionByTabRef,
  workerStructureEnabledRef,
}: CreateJsonWorkerFormatQueueArgs) {
  const prepareFormatRun = (
    tabId: string,
    text: string,
    stage: 'formatting' | 'repairing',
    preparation?: JsonFormatPreparation
  ) => {
    const locateRequested = Boolean(largeFileLocateEnabledRef.current[tabId]);
    const plan = preparation
      ? isProcessingPlan(preparation)
        ? preparation
        : buildJsonWorkerProcessingPlan(text, locateRequested, preparation)
      : buildJsonWorkerProcessingPlan(text, locateRequested);
    const requestId = ++requestCounterRef.current;

    clearFormatWatchdog(tabId);
    latestRequestRef.current[tabId] = requestId;
    if (largeModeRef.current[tabId] !== plan.largeMode) {
      callbacksRef.current.setTabLargeMode(tabId, plan.largeMode);
    }

    callbacksRef.current.setTabFormatting(tabId, true);
    callbacksRef.current.setProcessingStage(tabId, stage);
    callbacksRef.current.setLocateFeedback(tabId, null);
    // Keep the last complete result visible while the next one is prepared.
    // The result handler replaces it only when the new text/index is ready,
    // avoiding a blank pane during large background work.
    callbacksRef.current.setLargeViewerStatus(tabId, plan.shouldBuildLargeViewer ? 'building' : 'idle');
    workerStructureEnabledRef.current[tabId] = plan.workerLocateEnabled;
    callbacksRef.current.setStructureStatus(
      tabId,
      plan.workerLocateEnabled ? 'building' : plan.largeMode ? 'disabled' : 'ready'
    );

    return { plan, requestId };
  };

  const queueFormat = (
    tabId: string,
    text: string,
    immediate = false,
    preparation?: JsonFormatPreparation,
    delayMs?: number,
    reuseWorkerText = false,
    preparedTextBuffer?: ArrayBuffer
  ) => {
    clearPendingFormat(tabId);
    callbacksRef.current.setTabError(tabId, null);
    cancelInteractiveRequests(tabId);

    if (!text.trim()) {
      const rawBytes = preparation?.textByteLength ?? getUtf8ByteLength(text);
      callbacksRef.current.mutatePerformanceSession(
        tabId,
        (session) => {
          if (session.pendingFormat) {
            session.pendingFormat = false;
          }
          session.requestId = null;
          session.rawBytes = rawBytes;
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
      clearTabCache(tabId, 'ready');
      callbacksRef.current.updateFormattedContent(tabId, '', true, 0, rawBytes);
      return;
    }

    const { plan, requestId } = prepareFormatRun(tabId, text, 'formatting', preparation);
    const rawRevision = rawRevisionByTabRef.current[tabId] ?? 0;
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
      const textPayload = reuseWorkerText
        ? null
        : preparedTextBuffer?.byteLength === plan.textByteLength
          ? { message: { textBuffer: preparedTextBuffer }, transfer: [preparedTextBuffer] }
          : createWorkerTextPayload(text, plan.textByteLength);
      const request = {
        type: 'format' as const,
        requestId,
        tabId,
        enableStructure: plan.shouldBuildStructureIndex,
        enableDirectLocate: plan.shouldAttemptDirectLocate,
        deferStructure: plan.shouldDeferStructureIndex,
        buildViewer: plan.shouldBuildLargeViewer,
        structureWarmupDelayMs: plan.deferredStructureWarmupDelayMs,
        rawMetrics: plan.rawMetrics,
        rawRevision,
      };
      if (reuseWorkerText) {
        postWorkerRequest({ ...request, reuseText: true });
      } else if (textPayload) {
        postWorkerRequest({ ...request, ...textPayload.message }, textPayload.transfer);
      }
      scheduleFormatWatchdog({
        callbacksRef,
        clearFormatWatchdog,
        formatWatchdogTimersRef,
        latestRequestRef,
        requestId,
        stage: 'formatting',
        tabId,
        textLength: plan.textByteLength,
      });
    };

    if (immediate) {
      run();
      return;
    }

    formatTimersRef.current[tabId] = window.setTimeout(
      run,
      delayMs ?? (plan.largeMode ? LARGE_FILE_FORMAT_DEBOUNCE_MS : FORMAT_DEBOUNCE_MS)
    );
  };

  const queueRepair = (tabId: string, text: string, metrics?: JsonDocumentMetrics) => {
    clearPendingFormat(tabId);
    callbacksRef.current.setTabError(tabId, null);
    cancelInteractiveRequests(tabId);

    if (!text.trim()) {
      callbacksRef.current.setTabError(tabId, '没有可修复的 JSON 内容');
      return;
    }

    const { plan, requestId } = prepareFormatRun(tabId, text, 'repairing', metrics);
    const rawRevision = rawRevisionByTabRef.current[tabId] ?? 0;
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
        rawMetrics: plan.rawMetrics,
        rawRevision,
        ...textPayload.message,
      },
      textPayload.transfer
    );
    scheduleFormatWatchdog({
      callbacksRef,
      clearFormatWatchdog,
      formatWatchdogTimersRef,
      latestRequestRef,
      requestId,
      stage: 'repairing',
      tabId,
      textLength: plan.textByteLength,
    });
  };

  const queueFormatAfterUiUpdate = (
    tabId: string,
    text: string,
    delayMs = 0,
    preparation?: JsonFormatPreparation,
    preparedTextBuffer?: ArrayBuffer
  ) => {
    clearPendingFormat(tabId);
    formatTimersRef.current[tabId] = window.setTimeout(() => {
      delete formatTimersRef.current[tabId];
      queueFormat(tabId, text, true, preparation, undefined, false, preparedTextBuffer);
    }, delayMs);
  };

  return {
    queueFormat,
    queueFormatFromWorkerCache(tabId: string, text: string, metrics: JsonDocumentMetrics) {
      queueFormat(tabId, text, true, metrics, undefined, true);
    },
    queueFormatAfterEditSave(tabId: string, text: string, metrics?: JsonDocumentMetrics) {
      const preparation = metrics ?? measureJsonDocument(text);
      const shouldDelay = shouldUseLargeModeForMetrics(preparation);
      queueFormatAfterUiUpdate(tabId, text, shouldDelay ? EDIT_SAVE_FORMAT_DELAY_MS : 0, preparation);
    },
    queueFormatAfterImport(
      tabId: string,
      text: string,
      preparedPlan?: ReturnType<typeof buildJsonWorkerProcessingPlan>,
      preparedTextBuffer?: ArrayBuffer
    ) {
      queueFormatAfterUiUpdate(tabId, text, 0, preparedPlan, preparedTextBuffer);
    },
    queueRepair,
  };
}
