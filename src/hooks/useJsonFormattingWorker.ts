import { MutableRefObject, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { EDIT_SAVE_FORMAT_DELAY_MS, FORMAT_DEBOUNCE_MS, LARGE_FILE_FORMAT_DEBOUNCE_MS } from '../types/jsonTool';
import type {
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeRawViewerData,
  LocateFeedback,
  PerformanceTrigger,
  ProcessingStage,
  RightNodeSelection,
  StructureStatus,
  WorkerMessage,
} from '../types/jsonTool';
import { PerformanceSession } from './useJsonPerformanceTracking';
import { createJsonWorkerInteractiveFlow } from './jsonWorkerInteractiveFlow';
import { createJsonWorkerImportFlow } from './jsonWorkerImportFlow';
import { disposeModel, getLeftModelPath, getRightModelPath } from '../utils/jsonToolModels';
import { getUtf8ByteLength, shouldUseLargeMode } from '../utils/jsonDocumentMetrics';
import { buildJsonWorkerProcessingPlan } from '../utils/jsonWorkerPlan';
import { createJsonWorkerClient } from '../utils/jsonWorkerClient';
import { handleJsonFormattingWorkerResult } from './jsonFormattingWorkerResults';

interface UseJsonFormattingWorkerArgs {
  activeTabIdRef: MutableRefObject<string>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  leftViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  rightViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  performanceSessionsRef: MutableRefObject<Record<string, PerformanceSession>>;
  beginPerformanceSession: (
    tabId: string,
    trigger: PerformanceTrigger,
    sourceLabel: string,
    fileSizeBytes: number | null,
    rawBytes: number,
    largeMode: boolean
  ) => void;
  clearPerformanceState: (tabId: string, removeOnly?: boolean) => void;
  logEvent: (event: string, details?: Record<string, unknown>) => void;
  mutatePerformanceSession: (tabId: string, mutate: (session: PerformanceSession) => void, shouldLog?: boolean) => void;
  syncPerformanceSnapshot: (tabId: string, shouldLog?: boolean) => void;
  renameTab: (tabId: string, nextTitle: string) => void;
  removeTabState: (tabId: string) => void;
  setTabError: (tabId: string, message: string | null) => void;
  setTabImporting: (tabId: string, fileName: string | null) => void;
  setTabFormatting: (tabId: string, formatting: boolean) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  setProcessingStage: (tabId: string, stage: ProcessingStage) => void;
  setLocateFeedback: (tabId: string, feedback: LocateFeedback | null) => void;
  setRightNodeSelection: (tabId: string, selection: RightNodeSelection | null) => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
  setLargeViewerData: (tabId: string, data: LargeJsonViewerData | null) => void;
  setLargeRawViewerData: (tabId: string, data: LargeRawViewerData | null) => void;
  setLargeViewerStatus: (tabId: string, status: 'idle' | 'building' | 'ready') => void;
  setLargeViewerSearchResults: (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore?: boolean,
    nextStartOffset?: number,
    append?: boolean
  ) => void;
  setLeftSearchResults: (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore?: boolean,
    nextStartOffset?: number,
    append?: boolean
  ) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean) => void;
  updateFormattedContent: (tabId: string, content: string, syncModel?: boolean) => void;
  resetSearchState: () => void;
  revealLeftRange: (startOffset: number, endOffset: number) => void;
  clearLeftHighlights: () => void;
  clearRightHighlights: () => void;
}

export function useJsonFormattingWorker({
  activeTabIdRef,
  largeModeRef,
  largeFileLocateEnabledRef,
  leftViewStateByTabRef,
  rightViewStateByTabRef,
  structureStatusRef,
  workerStructureEnabledRef,
  rawTextByTabRef,
  formattedTextByTabRef,
  performanceSessionsRef,
  beginPerformanceSession,
  clearPerformanceState,
  logEvent,
  mutatePerformanceSession,
  syncPerformanceSnapshot,
  renameTab,
  removeTabState,
  setTabError,
  setTabImporting,
  setTabFormatting,
  setTabLargeMode,
  setProcessingStage,
  setLocateFeedback,
  setRightNodeSelection,
  setStructureStatus,
  setLargeViewerData,
  setLargeRawViewerData,
  setLargeViewerStatus,
  setLargeViewerSearchResults,
  setLeftSearchResults,
  updateTabContent,
  updateFormattedContent,
  resetSearchState,
  revealLeftRange,
  clearLeftHighlights,
  clearRightHighlights,
}: UseJsonFormattingWorkerArgs) {
  const workerRef = useRef<Worker | null>(null);
  const workerClientRef = useRef(createJsonWorkerClient(() => workerRef.current));
  const {
    createTextPayload: createWorkerTextPayload,
    postRequest: postWorkerRequest,
    readText: readWorkerText,
    readTextField: readWorkerTextField,
  } = workerClientRef.current;
  const formatTimersRef = useRef<Record<string, number>>({});
  const latestRequestRef = useRef<Record<string, number>>({});
  const requestCounterRef = useRef(0);
  const callbacksRef = useRef({
    beginPerformanceSession,
    clearLeftHighlights,
    clearPerformanceState,
    clearRightHighlights,
    logEvent,
    mutatePerformanceSession,
    removeTabState,
    renameTab,
    resetSearchState,
    revealLeftRange,
    setStructureStatus,
    setTabError,
    setTabFormatting,
    setTabImporting,
    setTabLargeMode,
    setProcessingStage,
    setLocateFeedback,
    setRightNodeSelection,
    setLargeViewerData,
    setLargeRawViewerData,
    setLeftSearchResults,
    setLargeViewerSearchResults,
    setLargeViewerStatus,
    syncPerformanceSnapshot,
    updateFormattedContent,
    updateTabContent,
  });

  callbacksRef.current = {
    beginPerformanceSession,
    clearLeftHighlights,
    clearPerformanceState,
    clearRightHighlights,
    logEvent,
    mutatePerformanceSession,
    removeTabState,
    renameTab,
    resetSearchState,
    revealLeftRange,
    setStructureStatus,
    setTabError,
    setTabFormatting,
    setTabImporting,
    setTabLargeMode,
    setProcessingStage,
    setLocateFeedback,
    setRightNodeSelection,
    setLargeViewerData,
    setLargeRawViewerData,
    setLeftSearchResults,
    setLargeViewerSearchResults,
    setLargeViewerStatus,
    syncPerformanceSnapshot,
    updateFormattedContent,
    updateTabContent,
  };
  const interactiveFlowRef = useRef<ReturnType<typeof createJsonWorkerInteractiveFlow> | null>(null);
  interactiveFlowRef.current ??= createJsonWorkerInteractiveFlow({
    activeTabIdRef,
    formattedTextByTabRef,
    getCallbacks: () => callbacksRef.current,
    postWorkerRequest,
    structureStatusRef,
    workerRef,
    workerStructureEnabledRef,
  });
  const interactiveFlow = interactiveFlowRef.current;

  const clearPendingFormat = (tabId: string) => {
    const timeoutId = formatTimersRef.current[tabId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete formatTimersRef.current[tabId];
    }
  };

  const cancelInteractiveRequests = (tabId: string) => {
    interactiveFlow.cancelRequests(tabId);
  };

  const clearTabStructure = (tabId: string, status: StructureStatus = 'ready') => {
    workerStructureEnabledRef.current[tabId] = false;
    cancelInteractiveRequests(tabId);
    postWorkerRequest({
      type: 'clear-structure',
      tabId,
    });
    callbacksRef.current.setStructureStatus(tabId, status);
    callbacksRef.current.setProcessingStage(tabId, 'idle');
  };

  const requestWorkerLocate = interactiveFlow.requestLocate;
  const requestWorkerSearch = interactiveFlow.requestSearch;
  const requestWorkerEditJson = interactiveFlow.requestEditJson;
  const requestWorkerEditJsonResult = interactiveFlow.requestEditJsonResult;

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

    const locateRequested = Boolean(largeFileLocateEnabledRef.current[tabId]);
    const plan = buildJsonWorkerProcessingPlan(text, locateRequested);

    if (largeModeRef.current[tabId] !== plan.largeMode) {
      callbacksRef.current.setTabLargeMode(tabId, plan.largeMode);
    }

    callbacksRef.current.setTabFormatting(tabId, true);
    callbacksRef.current.setProcessingStage(tabId, 'formatting');
    callbacksRef.current.setLocateFeedback(tabId, null);
    callbacksRef.current.setLargeViewerData(tabId, null);
    callbacksRef.current.setLargeRawViewerData(tabId, null);
    callbacksRef.current.setLargeViewerStatus(tabId, plan.shouldBuildLargeViewer ? 'building' : 'idle');
    workerStructureEnabledRef.current[tabId] = plan.workerLocateEnabled;
    callbacksRef.current.setStructureStatus(
      tabId,
      plan.workerLocateEnabled ? 'building' : plan.largeMode ? 'disabled' : 'ready'
    );

    const requestId = ++requestCounterRef.current;
    latestRequestRef.current[tabId] = requestId;
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

    const locateRequested = Boolean(largeFileLocateEnabledRef.current[tabId]);
    const plan = buildJsonWorkerProcessingPlan(text, locateRequested);
    const requestId = ++requestCounterRef.current;

    latestRequestRef.current[tabId] = requestId;
    callbacksRef.current.setTabFormatting(tabId, true);
    callbacksRef.current.setProcessingStage(tabId, 'repairing');
    callbacksRef.current.setLocateFeedback(tabId, null);
    callbacksRef.current.setLargeViewerData(tabId, null);
    callbacksRef.current.setLargeRawViewerData(tabId, null);
    callbacksRef.current.setLargeViewerStatus(tabId, plan.shouldBuildLargeViewer ? 'building' : 'idle');
    workerStructureEnabledRef.current[tabId] = plan.workerLocateEnabled;
    callbacksRef.current.setStructureStatus(
      tabId,
      plan.workerLocateEnabled ? 'building' : plan.largeMode ? 'disabled' : 'ready'
    );
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

  const queueFormatAfterImport = (tabId: string, text: string) => {
    queueFormatAfterUiUpdate(tabId, text);
  };

  const queueFormatAfterEditSave = (tabId: string, text: string) => {
    queueFormatAfterUiUpdate(tabId, text, shouldUseLargeMode(text) ? EDIT_SAVE_FORMAT_DELAY_MS : 0);
  };

  const resetTabArtifacts = (tabId: string) => {
    clearPendingFormat(tabId);
    callbacksRef.current.clearPerformanceState(tabId);
    callbacksRef.current.setTabImporting(tabId, null);
    callbacksRef.current.setTabFormatting(tabId, false);
    callbacksRef.current.setTabLargeMode(tabId, false);
    callbacksRef.current.setProcessingStage(tabId, 'idle');
    callbacksRef.current.setLocateFeedback(tabId, null);
    callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
    callbacksRef.current.setLargeViewerData(tabId, null);
    callbacksRef.current.setLargeRawViewerData(tabId, null);
    clearTabStructure(tabId, 'ready');
    latestRequestRef.current[tabId] = 0;
    callbacksRef.current.updateTabContent(tabId, '', true);
    callbacksRef.current.updateFormattedContent(tabId, '', true);
    callbacksRef.current.setTabError(tabId, null);
  };

  const removeTabArtifacts = (tabId: string) => {
    clearPendingFormat(tabId);
    callbacksRef.current.clearPerformanceState(tabId, true);
    postWorkerRequest({
      type: 'clear-structure',
      tabId,
    });
    delete formatTimersRef.current[tabId];
    delete latestRequestRef.current[tabId];
    cancelInteractiveRequests(tabId);
    delete largeModeRef.current[tabId];
    delete largeFileLocateEnabledRef.current[tabId];
    delete structureStatusRef.current[tabId];
    delete workerStructureEnabledRef.current[tabId];

    callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
    callbacksRef.current.setLargeViewerData(tabId, null);
    callbacksRef.current.setLargeRawViewerData(tabId, null);
    callbacksRef.current.setProcessingStage(tabId, 'idle');
    callbacksRef.current.setLocateFeedback(tabId, null);
    delete rawTextByTabRef.current[tabId];
    delete formattedTextByTabRef.current[tabId];
    delete leftViewStateByTabRef.current[tabId];
    delete rightViewStateByTabRef.current[tabId];
    disposeModel(getLeftModelPath(tabId));
    disposeModel(getRightModelPath(tabId));
    callbacksRef.current.removeTabState(tabId);
  };

  const importFlowRef = useRef<ReturnType<typeof createJsonWorkerImportFlow> | null>(null);
  importFlowRef.current ??= createJsonWorkerImportFlow({
    cancelInteractiveRequests,
    getCallbacks: () => callbacksRef.current,
    largeFileLocateEnabledRef,
    postClearStructure: (tabId) => {
      postWorkerRequest({
        type: 'clear-structure',
        tabId,
      });
    },
    queueFormatAfterImport,
    workerStructureEnabledRef,
  });
  const { importJsonFile, importJsonText } = importFlowRef.current;

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
      const { type, requestId, tabId } = event.data;

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
  }, [activeTabIdRef, performanceSessionsRef]);

  return {
    clearTabStructure,
    importJsonFile,
    importJsonText,
    queueFormat,
    queueRepair,
    queueFormatAfterEditSave,
    removeTabArtifacts,
    requestWorkerSearch,
    requestWorkerLocate,
    requestWorkerEditJson,
    requestWorkerEditJsonResult,
    resetTabArtifacts,
  };
}
