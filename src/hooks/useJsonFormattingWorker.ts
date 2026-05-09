import { MutableRefObject, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  DEDICATED_RIGHT_VIEWER_THRESHOLD,
  EDIT_SAVE_FORMAT_DELAY_MS,
  FORMAT_DEBOUNCE_MS,
  LARGE_FILE_THRESHOLD,
  LARGE_FILE_FORMAT_DEBOUNCE_MS,
} from '../types/jsonTool';
import type {
  EditJsonWorkerOperation,
  JsonEditPath,
  JsonSearchOptions,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeRawViewerData,
  LocateFeedback,
  PerformanceTrigger,
  ProcessingStage,
  SearchTarget,
  StructureStatus,
  WorkerMessage,
} from '../types/jsonTool';
import { PerformanceSession } from './useJsonPerformanceTracking';
import {
  disposeModel,
  getFileName,
  getLeftModelPath,
  getRightModelPath,
  getUtf8ByteLength,
  shouldBuildWorkerStructure,
  shouldUseLargeMode,
} from '../utils/jsonToolModels';

interface JsonImportSource {
  name: string;
  size: number;
  readText: () => Promise<string>;
}

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
  mutatePerformanceSession: (
    tabId: string,
    mutate: (session: PerformanceSession) => void,
    shouldLog?: boolean
  ) => void;
  syncPerformanceSnapshot: (tabId: string, shouldLog?: boolean) => void;
  renameTab: (tabId: string, nextTitle: string) => void;
  removeTabState: (tabId: string) => void;
  setTabError: (tabId: string, message: string | null) => void;
  setTabImporting: (tabId: string, fileName: string | null) => void;
  setTabFormatting: (tabId: string, formatting: boolean) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  setProcessingStage: (tabId: string, stage: ProcessingStage) => void;
  setLocateFeedback: (tabId: string, feedback: LocateFeedback | null) => void;
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
  const textEncoderRef = useRef<TextEncoder | null>(null);
  const textDecoderRef = useRef<TextDecoder | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const formatTimersRef = useRef<Record<string, number>>({});
  const latestRequestRef = useRef<Record<string, number>>({});
  const requestCounterRef = useRef(0);
  const locateRequestCounterRef = useRef(0);
  const latestLocateRequestRef = useRef<Record<string, number>>({});
  const searchRequestCounterRef = useRef(0);
  const latestSearchRequestRef = useRef<Record<string, number>>({});
  const pendingValueRequestsRef = useRef<Record<number, (value: string | null) => void>>({});
  const pendingEditJsonRequestsRef = useRef<Record<number, {
    reject: (error: Error) => void;
    resolve: (value: WorkerMessage) => void;
  }>>({});
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
    setLargeViewerData,
    setLargeRawViewerData,
    setLeftSearchResults,
    setLargeViewerSearchResults,
    setLargeViewerStatus,
    syncPerformanceSnapshot,
    updateFormattedContent,
    updateTabContent,
  };

  const clearPendingFormat = (tabId: string) => {
    const timeoutId = formatTimersRef.current[tabId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete formatTimersRef.current[tabId];
    }
  };

  const clearTabStructure = (tabId: string, status: StructureStatus = 'ready') => {
    workerStructureEnabledRef.current[tabId] = false;
    delete latestLocateRequestRef.current[tabId];
    delete latestSearchRequestRef.current[`left:${tabId}`];
    delete latestSearchRequestRef.current[`right:${tabId}`];
    workerRef.current?.postMessage({
      type: 'clear-structure',
      tabId,
    });
    callbacksRef.current.setStructureStatus(tabId, status);
    callbacksRef.current.setProcessingStage(tabId, 'idle');
  };

  const getTextEncoder = () => {
    if (!textEncoderRef.current) {
      textEncoderRef.current = new TextEncoder();
    }

    return textEncoderRef.current;
  };

  const getTextDecoder = () => {
    if (!textDecoderRef.current) {
      textDecoderRef.current = new TextDecoder();
    }

    return textDecoderRef.current;
  };

  const createWorkerTextPayload = (text: string, byteLength = getUtf8ByteLength(text)) => {
    if (byteLength < LARGE_FILE_THRESHOLD) {
      return {
        message: { text },
        transfer: [] as Transferable[],
      };
    }

    const bytes = getTextEncoder().encode(text);
    const buffer = bytes.buffer as ArrayBuffer;
    return {
      message: { textBuffer: buffer },
      transfer: [buffer] as Transferable[],
    };
  };

  const readWorkerTextField = (
    message: WorkerMessage,
    stringKey: 'data' | 'repairedText',
    bufferKey: 'dataBuffer' | 'repairedTextBuffer'
  ) => {
    if (typeof message[stringKey] === 'string') {
      return message[stringKey];
    }

    if (message[bufferKey] instanceof ArrayBuffer) {
      return getTextDecoder().decode(new Uint8Array(message[bufferKey]));
    }

    return null;
  };

  const readWorkerText = (message: WorkerMessage) => (
    readWorkerTextField(message, 'data', 'dataBuffer')
  );

  const requestWorkerLocate = (tabId: string, offset: number) => {
    if (
      !workerRef.current
      || !workerStructureEnabledRef.current[tabId]
      || structureStatusRef.current[tabId] !== 'ready'
    ) {
      callbacksRef.current.setLocateFeedback(tabId, {
        status: 'failed',
        message: structureStatusRef.current[tabId] === 'building'
          ? '定位索引中'
          : '当前位置无法映射',
        updatedAt: Date.now(),
      });
      return;
    }

    const requestId = ++locateRequestCounterRef.current;
    latestLocateRequestRef.current[tabId] = requestId;
    // A locate request consumes the ready index. Keep the index status stable
    // so right-side clicks do not look like they rebuild the index every time.
    callbacksRef.current.setLocateFeedback(tabId, {
      status: 'pending',
      message: `正在定位 offset ${Math.max(0, Math.floor(offset)).toLocaleString()}`,
      updatedAt: Date.now(),
    });
    workerRef.current.postMessage({
      type: 'locate',
      requestId,
      tabId,
      offset,
    });
  };

  const requestWorkerSearch = (
    tabId: string,
    query: string,
    searchOptions: JsonSearchOptions,
    startOffset = 0,
    append = false,
    target: SearchTarget = 'right',
    text?: string,
    rawRevision?: number
  ) => {
    if (!workerRef.current) {
      if (target === 'left') {
        callbacksRef.current.setLeftSearchResults(tabId, []);
      } else {
        callbacksRef.current.setLargeViewerSearchResults(tabId, []);
      }
      return;
    }

    const requestId = ++searchRequestCounterRef.current;
    const requestKey = `${target}:${tabId}`;
    latestSearchRequestRef.current[requestKey] = requestId;
    workerRef.current.postMessage({
      type: 'search',
      requestId,
      tabId,
      target,
      query,
      searchOptions,
      startOffset,
      append,
      text,
      rawRevision,
    });
  };

  const requestWorkerValue = (
    tabId: string,
    offset: number,
    preferCachedText = false
  ) => new Promise<string | null>((resolve) => {
    if (!workerRef.current) {
      resolve(null);
      return;
    }

    const requestId = ++locateRequestCounterRef.current;
    pendingValueRequestsRef.current[requestId] = resolve;

    if (
      workerStructureEnabledRef.current[tabId]
      && structureStatusRef.current[tabId] === 'ready'
    ) {
      workerRef.current.postMessage({
        type: 'read-value',
        requestId,
        tabId,
        offset,
      });
      return;
    }

    if (preferCachedText) {
      workerRef.current.postMessage({
        type: 'read-value-direct',
        requestId,
        tabId,
        offset,
      });
      return;
    }

    const formattedText = formattedTextByTabRef.current[tabId] ?? '';
    if (!formattedText) {
      delete pendingValueRequestsRef.current[requestId];
      resolve(null);
      return;
    }

    workerRef.current.postMessage({
      type: 'read-value-direct',
      requestId,
      tabId,
      offset,
      text: formattedText,
    });
  });

  const requestWorkerEditJsonResult = (
    tabId: string,
    operation: EditJsonWorkerOperation,
    text: string,
    originalText?: string,
    path?: JsonEditPath,
    offset?: number
  ) => new Promise<WorkerMessage>((resolve, reject) => {
    if (!workerRef.current) {
      reject(new Error('JSON worker is not ready'));
      return;
    }

    const requestId = ++locateRequestCounterRef.current;
    pendingEditJsonRequestsRef.current[requestId] = { reject, resolve };
    workerRef.current.postMessage({
      type: 'edit-json',
      requestId,
      tabId,
      operation,
      text,
      originalText,
      path,
      offset,
    });
  });

  const requestWorkerEditJson = (
    tabId: string,
    operation: EditJsonWorkerOperation,
    text: string,
    originalText?: string,
    path?: JsonEditPath,
    offset?: number
  ) => requestWorkerEditJsonResult(
    tabId,
    operation,
    text,
    originalText,
    path,
    offset
  ).then((message) => {
    if (typeof message.data !== 'string') {
      throw new Error('JSON worker returned an empty result');
    }

    return message.data;
  });

  const queueFormat = (tabId: string, text: string, immediate = false) => {
    clearPendingFormat(tabId);
    callbacksRef.current.setTabError(tabId, null);
    delete latestLocateRequestRef.current[tabId];
    delete latestSearchRequestRef.current[`left:${tabId}`];
    delete latestSearchRequestRef.current[`right:${tabId}`];

    if (!text.trim()) {
      callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
        if (session.pendingFormat) {
          session.pendingFormat = false;
        }
        session.requestId = null;
        session.rawBytes = getUtf8ByteLength(text);
        session.formattedBytes = 0;
        session.status = 'ready';
        session.error = null;
      }, true);
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

    const textByteLength = getUtf8ByteLength(text);
    const locateRequested = Boolean(largeFileLocateEnabledRef.current[tabId]);
    const largeMode = shouldUseLargeMode(text);
    const shouldBuildStructureIndex = shouldBuildWorkerStructure(
      text,
      locateRequested
    );
    const shouldAttemptDirectLocate = !shouldBuildStructureIndex && locateRequested && largeMode;
    const workerLocateEnabled = shouldBuildStructureIndex || shouldAttemptDirectLocate;
    const shouldDeferStructureIndex = largeMode && shouldBuildStructureIndex;

    if (largeModeRef.current[tabId] !== largeMode) {
      callbacksRef.current.setTabLargeMode(tabId, largeMode);
    }

    const shouldBuildLargeViewer = textByteLength >= DEDICATED_RIGHT_VIEWER_THRESHOLD;
    callbacksRef.current.setTabFormatting(tabId, true);
    callbacksRef.current.setProcessingStage(tabId, 'formatting');
    callbacksRef.current.setLocateFeedback(tabId, null);
    callbacksRef.current.setLargeViewerData(tabId, null);
    callbacksRef.current.setLargeRawViewerData(tabId, null);
    callbacksRef.current.setLargeViewerStatus(
      tabId,
      shouldBuildLargeViewer ? 'building' : 'idle'
    );
    workerStructureEnabledRef.current[tabId] = workerLocateEnabled;
    callbacksRef.current.setStructureStatus(
      tabId,
      workerLocateEnabled ? 'building' : (largeMode ? 'disabled' : 'ready')
    );

    const requestId = ++requestCounterRef.current;
    latestRequestRef.current[tabId] = requestId;
    callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
      if (!session.pendingFormat) {
        return;
      }

      session.pendingFormat = false;
      session.requestId = requestId;
      session.largeMode = largeMode;
      session.structureEnabled = workerLocateEnabled;
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
      textLength: textByteLength,
      immediate,
      largeMode,
      workerStructureEnabled: shouldBuildStructureIndex,
      workerStructureDeferred: shouldDeferStructureIndex,
      workerDirectLocateEnabled: shouldAttemptDirectLocate,
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
        textLength: getUtf8ByteLength(text),
      });
      const textPayload = createWorkerTextPayload(text, textByteLength);
      workerRef.current?.postMessage({
        type: 'format',
        requestId,
        tabId,
        enableStructure: shouldBuildStructureIndex,
        enableDirectLocate: shouldAttemptDirectLocate,
        deferStructure: shouldDeferStructureIndex,
        buildViewer: shouldBuildLargeViewer,
        ...textPayload.message,
      }, textPayload.transfer);
    };

    if (immediate) {
      run();
      return;
    }

    formatTimersRef.current[tabId] = window.setTimeout(
      run,
      largeMode ? LARGE_FILE_FORMAT_DEBOUNCE_MS : FORMAT_DEBOUNCE_MS
    );
  };

  const queueRepair = (tabId: string, text: string) => {
    clearPendingFormat(tabId);
    callbacksRef.current.setTabError(tabId, null);
    delete latestLocateRequestRef.current[tabId];
    delete latestSearchRequestRef.current[`left:${tabId}`];
    delete latestSearchRequestRef.current[`right:${tabId}`];

    if (!text.trim()) {
      callbacksRef.current.setTabError(tabId, '没有可修复的 JSON 内容');
      return;
    }

    const textByteLength = getUtf8ByteLength(text);
    const locateRequested = Boolean(largeFileLocateEnabledRef.current[tabId]);
    const largeMode = shouldUseLargeMode(text);
    const shouldBuildStructureIndex = shouldBuildWorkerStructure(
      text,
      locateRequested
    );
    const shouldAttemptDirectLocate = !shouldBuildStructureIndex && locateRequested && largeMode;
    const workerLocateEnabled = shouldBuildStructureIndex || shouldAttemptDirectLocate;
    const shouldDeferStructureIndex = largeMode && shouldBuildStructureIndex;
    const shouldBuildLargeViewer = textByteLength >= DEDICATED_RIGHT_VIEWER_THRESHOLD;
    const requestId = ++requestCounterRef.current;

    latestRequestRef.current[tabId] = requestId;
    callbacksRef.current.setTabFormatting(tabId, true);
    callbacksRef.current.setProcessingStage(tabId, 'repairing');
    callbacksRef.current.setLocateFeedback(tabId, null);
    callbacksRef.current.setLargeViewerData(tabId, null);
    callbacksRef.current.setLargeRawViewerData(tabId, null);
    callbacksRef.current.setLargeViewerStatus(
      tabId,
      shouldBuildLargeViewer ? 'building' : 'idle'
    );
    workerStructureEnabledRef.current[tabId] = workerLocateEnabled;
    callbacksRef.current.setStructureStatus(
      tabId,
      workerLocateEnabled ? 'building' : (largeMode ? 'disabled' : 'ready')
    );
    callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
      if (!session.pendingFormat) {
        return;
      }

      session.pendingFormat = false;
      session.requestId = requestId;
      session.largeMode = largeMode;
      session.structureEnabled = workerLocateEnabled;
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
      textLength: textByteLength,
      largeMode,
      workerStructureEnabled: shouldBuildStructureIndex,
      workerStructureDeferred: shouldDeferStructureIndex,
      workerDirectLocateEnabled: shouldAttemptDirectLocate,
    });

    const textPayload = createWorkerTextPayload(text, textByteLength);
    workerRef.current?.postMessage({
      type: 'repair',
      requestId,
      tabId,
      enableStructure: shouldBuildStructureIndex,
      enableDirectLocate: shouldAttemptDirectLocate,
      deferStructure: shouldDeferStructureIndex,
      buildViewer: shouldBuildLargeViewer,
      ...textPayload.message,
    }, textPayload.transfer);
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
    queueFormatAfterUiUpdate(
      tabId,
      text,
      shouldUseLargeMode(text) ? EDIT_SAVE_FORMAT_DELAY_MS : 0
    );
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
    workerRef.current?.postMessage({
      type: 'clear-structure',
      tabId,
    });
    delete formatTimersRef.current[tabId];
    delete latestRequestRef.current[tabId];
    delete latestLocateRequestRef.current[tabId];
    delete latestSearchRequestRef.current[`left:${tabId}`];
    delete latestSearchRequestRef.current[`right:${tabId}`];
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

  const importJsonSource = async (tabId: string, source: JsonImportSource) => {
    const presumedLargeMode = source.size >= LARGE_FILE_THRESHOLD;

    try {
      callbacksRef.current.beginPerformanceSession(
        tabId,
        'import',
        source.name,
        source.size,
        source.size,
        presumedLargeMode
      );
      callbacksRef.current.logEvent('import-start', {
        tabId,
        fileName: source.name,
        fileSize: source.size,
      });
      callbacksRef.current.setTabError(tabId, null);
      callbacksRef.current.setTabImporting(tabId, source.name);
      callbacksRef.current.setTabFormatting(tabId, false);
      callbacksRef.current.setProcessingStage(tabId, 'reading');
      callbacksRef.current.setLocateFeedback(tabId, null);
      callbacksRef.current.renameTab(tabId, getFileName(source.name));
      callbacksRef.current.setTabLargeMode(tabId, presumedLargeMode);
      callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
      callbacksRef.current.setLargeViewerData(tabId, null);
      callbacksRef.current.setLargeRawViewerData(tabId, null);
      callbacksRef.current.setStructureStatus(tabId, presumedLargeMode ? 'disabled' : 'ready');
      workerStructureEnabledRef.current[tabId] = false;
      delete latestLocateRequestRef.current[tabId];
      workerRef.current?.postMessage({
        type: 'clear-structure',
        tabId,
      });
      callbacksRef.current.resetSearchState();

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });

      callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
        session.readStartedAt = performance.now();
      });
      const content = await source.readText();
      const rawBytes = getUtf8ByteLength(content);
      callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
        session.readCompletedAt = performance.now();
        session.rawBytes = rawBytes;
      });
      callbacksRef.current.logEvent('import-read-complete', {
        tabId,
        fileName: source.name,
        rawLength: rawBytes,
      });
      const locateRequested = Boolean(largeFileLocateEnabledRef.current[tabId]);
      const largeMode = shouldUseLargeMode(content);
      const shouldBuildStructureIndex = shouldBuildWorkerStructure(
        content,
        locateRequested
      );
      const shouldAttemptDirectLocate = !shouldBuildStructureIndex && locateRequested && largeMode;
      const workerLocateEnabled = shouldBuildStructureIndex || shouldAttemptDirectLocate;

      callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
        session.leftModelStartedAt = performance.now();
        session.largeMode = largeMode;
        session.structureEnabled = workerLocateEnabled;
      });
      callbacksRef.current.setProcessingStage(tabId, 'syncing-left');
      callbacksRef.current.updateTabContent(tabId, content, true);
      callbacksRef.current.updateFormattedContent(tabId, '', true);
      callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
        session.leftModelCompletedAt = performance.now();
      });
      callbacksRef.current.setTabLargeMode(tabId, largeMode);
      callbacksRef.current.setTabFormatting(tabId, true);
      callbacksRef.current.setTabImporting(tabId, null);
      callbacksRef.current.setProcessingStage(tabId, 'formatting');
      workerStructureEnabledRef.current[tabId] = workerLocateEnabled;
      callbacksRef.current.setStructureStatus(
        tabId,
        workerLocateEnabled ? 'building' : (largeMode ? 'disabled' : 'ready')
      );
      queueFormatAfterImport(tabId, content);
    } catch (error) {
      callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
        session.status = 'failed';
        session.error = error instanceof Error ? error.message : String(error);
      }, true);
      callbacksRef.current.logEvent('import-failed', {
        tabId,
        fileName: source.name,
        error: error instanceof Error ? error.message : String(error),
      });
      callbacksRef.current.setTabImporting(tabId, null);
      callbacksRef.current.setTabFormatting(tabId, false);
      callbacksRef.current.setProcessingStage(tabId, 'idle');
      callbacksRef.current.setLocateFeedback(tabId, null);
      callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
      callbacksRef.current.setLargeViewerData(tabId, null);
      callbacksRef.current.setLargeRawViewerData(tabId, null);
      callbacksRef.current.setTabError(
        tabId,
        error instanceof Error ? `导入失败：${error.message}` : '导入失败'
      );
    }
  };

  const importJsonFile = async (tabId: string, file: File) => (
    importJsonSource(tabId, {
      name: file.name,
      size: file.size,
      readText: () => file.text(),
    })
  );

  const importJsonText = async (
    tabId: string,
    name: string,
    size: number,
    content: string
  ) => (
    importJsonSource(tabId, {
      name,
      size,
      readText: async () => content,
    })
  );

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/jsonParser.worker.js', import.meta.url),
      { type: 'module' }
    );

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

      if (type === 'format-result') {
        const { success, error } = event.data;
        const data = readWorkerText(event.data);
        const performanceSession = performanceSessionsRef.current[tabId];

        if (latestRequestRef.current[tabId] !== requestId) {
          return;
        }

        if (success && data) {
          const rawText = rawTextByTabRef.current[tabId] ?? '';
          const largeMode = shouldUseLargeMode(rawText, data);
          const formatCompletedAt = performance.now();
          callbacksRef.current.logEvent('format-success', {
            tabId,
            requestId,
            formattedLength: getUtf8ByteLength(data),
          });
          callbacksRef.current.setTabFormatting(tabId, false);
          callbacksRef.current.setTabLargeMode(tabId, largeMode);
          callbacksRef.current.setLargeRawViewerData(tabId, event.data.rawViewerData ?? null);
          const shouldBuildLargeViewer = getUtf8ByteLength(rawText) >= DEDICATED_RIGHT_VIEWER_THRESHOLD;
          callbacksRef.current.setProcessingStage(
            tabId,
            shouldBuildLargeViewer ? 'building-viewer' : (performanceSession?.structureEnabled ? 'building-index' : 'idle')
          );
          if (performanceSession?.requestId === requestId) {
            performanceSession.formatCompletedAt = formatCompletedAt;
            performanceSession.rightModelStartedAt = performance.now();
            performanceSession.formattedBytes = getUtf8ByteLength(data);
            performanceSession.largeMode = largeMode;
          }
          callbacksRef.current.updateFormattedContent(tabId, data, true);
          if (performanceSession?.requestId === requestId) {
            performanceSession.rightModelCompletedAt = performance.now();
            performanceSession.status = performanceSession.structureEnabled ? 'running' : 'ready';
            performanceSession.error = null;
            callbacksRef.current.syncPerformanceSnapshot(tabId, !performanceSession.structureEnabled);
          }
          callbacksRef.current.setTabError(tabId, null);
          return;
        }

      callbacksRef.current.setTabFormatting(tabId, false);
      callbacksRef.current.setProcessingStage(tabId, 'idle');
      callbacksRef.current.setLocateFeedback(tabId, null);
      callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
        callbacksRef.current.setLargeViewerData(tabId, null);
        callbacksRef.current.setLargeRawViewerData(tabId, null);
        callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
          if (session.requestId !== requestId) {
            return;
          }

          session.formatCompletedAt = performance.now();
          session.status = 'failed';
          session.error = error ?? 'JSON parse failed';
        }, true);
        callbacksRef.current.logEvent('format-failed', {
          tabId,
          requestId,
          error: error ?? 'JSON parse failed',
        });
        callbacksRef.current.updateFormattedContent(tabId, '', true);
        callbacksRef.current.setTabError(tabId, error ?? 'JSON 解析失败');
        callbacksRef.current.setStructureStatus(tabId, 'disabled');
        return;
      }

      if (type === 'repair-result') {
        const { success, error } = event.data;
        const formattedText = readWorkerText(event.data);
        const repairedText = readWorkerTextField(event.data, 'repairedText', 'repairedTextBuffer');
        const performanceSession = performanceSessionsRef.current[tabId];

        if (latestRequestRef.current[tabId] !== requestId) {
          return;
        }

        if (success && typeof formattedText === 'string' && typeof repairedText === 'string') {
          const largeMode = shouldUseLargeMode(repairedText, formattedText);
          const now = performance.now();
          callbacksRef.current.logEvent('repair-success', {
            tabId,
            requestId,
            repairedLength: getUtf8ByteLength(repairedText),
            formattedLength: getUtf8ByteLength(formattedText),
          });
          callbacksRef.current.setTabFormatting(tabId, false);
          callbacksRef.current.setTabLargeMode(tabId, largeMode);
          const shouldBuildLargeViewer = getUtf8ByteLength(repairedText) >= DEDICATED_RIGHT_VIEWER_THRESHOLD;
          callbacksRef.current.setProcessingStage(
            tabId,
            shouldBuildLargeViewer ? 'building-viewer' : (performanceSession?.structureEnabled ? 'building-index' : 'idle')
          );
          if (performanceSession?.requestId === requestId) {
            performanceSession.leftModelStartedAt = now;
            performanceSession.leftModelCompletedAt = now;
            performanceSession.formatCompletedAt = now;
            performanceSession.rightModelStartedAt = performance.now();
            performanceSession.rawBytes = getUtf8ByteLength(repairedText);
            performanceSession.formattedBytes = getUtf8ByteLength(formattedText);
            performanceSession.largeMode = largeMode;
          }
          callbacksRef.current.updateTabContent(tabId, repairedText, true);
          callbacksRef.current.setLargeRawViewerData(tabId, event.data.rawViewerData ?? null);
          callbacksRef.current.updateFormattedContent(tabId, formattedText, true);
          callbacksRef.current.resetSearchState();
          if (performanceSession?.requestId === requestId) {
            performanceSession.rightModelCompletedAt = performance.now();
            performanceSession.status = performanceSession.structureEnabled ? 'running' : 'ready';
            performanceSession.error = null;
            callbacksRef.current.syncPerformanceSnapshot(tabId, !performanceSession.structureEnabled);
          }
          callbacksRef.current.setTabError(tabId, null);
          return;
        }

        callbacksRef.current.setTabFormatting(tabId, false);
        callbacksRef.current.setProcessingStage(tabId, 'idle');
        callbacksRef.current.setLocateFeedback(tabId, null);
        callbacksRef.current.setLargeViewerStatus(tabId, 'idle');
        callbacksRef.current.setLargeViewerData(tabId, null);
        callbacksRef.current.setLargeRawViewerData(tabId, null);
        callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
          if (session.requestId !== requestId) {
            return;
          }

          session.formatCompletedAt = performance.now();
          session.status = 'failed';
          session.error = error ?? 'JSON repair failed';
        }, true);
        callbacksRef.current.logEvent('repair-failed', {
          tabId,
          requestId,
          error: error ?? 'JSON repair failed',
        });
        callbacksRef.current.setTabError(tabId, error ? `修复失败：${error}` : 'JSON 修复失败');
        callbacksRef.current.setStructureStatus(tabId, 'disabled');
        return;
      }

      if (type === 'viewer-ready') {
        if (latestRequestRef.current[tabId] !== requestId) {
          return;
        }

        const performanceSession = performanceSessionsRef.current[tabId];
        if (performanceSession?.requestId === requestId) {
          performanceSession.viewerIndexMs = typeof event.data.viewerIndexMs === 'number'
            ? event.data.viewerIndexMs
            : null;
          performanceSession.viewerReadyAt = performance.now();
          if (!performanceSession.structureEnabled) {
            performanceSession.status = 'ready';
          }
          callbacksRef.current.syncPerformanceSnapshot(tabId, !performanceSession.structureEnabled);
        }

        callbacksRef.current.setLargeViewerData(tabId, event.data.viewerData ?? null);
        callbacksRef.current.setLargeViewerStatus(
          tabId,
          event.data.viewerData ? 'ready' : 'idle'
        );
        callbacksRef.current.setProcessingStage(
          tabId,
          performanceSession?.structureEnabled && structureStatusRef.current[tabId] === 'building'
            ? 'building-index'
            : 'idle'
        );
        return;
      }

      if (type === 'structure-ready') {
        if (latestRequestRef.current[tabId] !== requestId) {
          return;
        }

        const performanceSession = performanceSessionsRef.current[tabId];
        callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
          if (session.requestId !== requestId) {
            return;
          }

          session.structureCompletedAt = performance.now();
          session.status = 'ready';
        }, true);
        callbacksRef.current.setStructureStatus(
          tabId,
          event.data.ready ? 'ready' : 'disabled'
        );
        const rawText = rawTextByTabRef.current[tabId] ?? '';
        const formattedText = formattedTextByTabRef.current[tabId] ?? '';
        const shouldWaitForViewer = getUtf8ByteLength(rawText) >= DEDICATED_RIGHT_VIEWER_THRESHOLD
          || getUtf8ByteLength(formattedText) >= DEDICATED_RIGHT_VIEWER_THRESHOLD;
        const viewerReady = !shouldWaitForViewer || Boolean(performanceSession?.viewerReadyAt);
        if (viewerReady) {
          callbacksRef.current.setProcessingStage(tabId, 'idle');
        }
        return;
      }

      if (type === 'search-result') {
        const target = event.data.target ?? 'right';
        const requestKey = `${target}:${tabId}`;
        if (
          tabId !== activeTabIdRef.current
          || latestSearchRequestRef.current[requestKey] !== requestId
        ) {
          return;
        }

        const applyResults = target === 'left'
          ? callbacksRef.current.setLeftSearchResults
          : callbacksRef.current.setLargeViewerSearchResults;

        applyResults(
          tabId,
          event.data.matches ?? [],
          Boolean(event.data.hasMore),
          event.data.nextStartOffset ?? 0,
          Boolean(event.data.append)
        );
        return;
      }

      if (type === 'locate-result') {
        if (
          tabId !== activeTabIdRef.current
          || latestLocateRequestRef.current[tabId] !== requestId
        ) {
          return;
        }

        if (workerStructureEnabledRef.current[tabId]) {
          callbacksRef.current.setStructureStatus(tabId, 'ready');
        }
        callbacksRef.current.setProcessingStage(tabId, 'idle');

        if (event.data.found && typeof event.data.startOffset === 'number' && typeof event.data.endOffset === 'number') {
          callbacksRef.current.setLocateFeedback(tabId, {
            status: 'success',
            message: `已定位到 offset ${event.data.startOffset.toLocaleString()}`,
            startOffset: event.data.startOffset,
            endOffset: event.data.endOffset,
            updatedAt: Date.now(),
          });
          callbacksRef.current.revealLeftRange(event.data.startOffset, event.data.endOffset);
        } else {
          callbacksRef.current.setLocateFeedback(tabId, {
            status: 'failed',
            message: '该位置无法映射',
            updatedAt: Date.now(),
          });
        }
        return;
      }

      if (type === 'value-result') {
        const resolve = pendingValueRequestsRef.current[requestId];
        if (!resolve) {
          return;
        }

        delete pendingValueRequestsRef.current[requestId];
        resolve(event.data.found ? (event.data.value ?? null) : null);
        return;
      }

      if (type === 'edit-json-result') {
        const pending = pendingEditJsonRequestsRef.current[requestId];
        if (!pending) {
          return;
        }

        delete pendingEditJsonRequestsRef.current[requestId];
        if (event.data.success && typeof event.data.data === 'string') {
          pending.resolve(event.data);
        } else {
          pending.reject(new Error(event.data.error ?? 'JSON 处理失败'));
        }
      }
    };

    return () => {
      Object.keys(formatTimersRef.current).forEach(clearPendingFormat);
      callbacksRef.current.clearLeftHighlights();
      callbacksRef.current.clearRightHighlights();
      Object.keys(pendingValueRequestsRef.current).forEach((requestId) => {
        pendingValueRequestsRef.current[Number(requestId)]?.(null);
        delete pendingValueRequestsRef.current[Number(requestId)];
      });
      Object.keys(pendingEditJsonRequestsRef.current).forEach((requestId) => {
        pendingEditJsonRequestsRef.current[Number(requestId)]?.reject(new Error('JSON worker stopped'));
        delete pendingEditJsonRequestsRef.current[Number(requestId)];
      });
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
    requestWorkerValue,
    requestWorkerEditJson,
    requestWorkerEditJsonResult,
    resetTabArtifacts,
  };
}
