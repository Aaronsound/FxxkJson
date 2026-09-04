import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { type MutableRefObject, useCallback, useRef, useState } from 'react';
import type {
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeRawViewerData,
  LocateFeedback,
  PerformanceTrigger,
  ProcessingStage,
  RightNodeSelection,
  StructureStatus,
} from '../types/jsonTool';
import { createJsonWorkerFormatQueue } from './jsonWorkerFormatQueue';
import { createJsonWorkerImportFlow } from './jsonWorkerImportFlow';
import { createJsonWorkerInteractiveFlow } from './jsonWorkerInteractiveFlow';
import { createJsonWorkerTabArtifactActions } from './jsonWorkerTabArtifacts';
import type { PerformanceSession } from './useJsonPerformanceTracking';
import { useJsonWorkerCallbacksRef } from './useJsonWorkerCallbacksRef';
import { useJsonWorkerInternalRefs } from './useJsonWorkerInternalRefs';
import { useJsonWorkerLifecycle } from './useJsonWorkerLifecycle';

export interface UseJsonFormattingWorkerArgs {
  activeTabIdRef: MutableRefObject<string>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  leftViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  leftSearchWorkerRevisionRef: MutableRefObject<Record<string, number>>;
  rightViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  rawRevisionByTabRef: MutableRefObject<Record<string, number>>;
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
  updateTabContent: (tabId: string, content: string, syncModel?: boolean, byteLength?: number) => void;
  updateFormattedContent: (
    tabId: string,
    content: string,
    syncModel?: boolean,
    byteLength?: number,
    rawByteLength?: number
  ) => void;
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
  leftSearchWorkerRevisionRef,
  rightViewStateByTabRef,
  structureStatusRef,
  workerStructureEnabledRef,
  rawTextByTabRef,
  rawRevisionByTabRef,
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
  const { formatTimersRef, formatWatchdogTimersRef, latestRequestRef, requestCounterRef, workerRef, workerClient } =
    useJsonWorkerInternalRefs();
  const {
    createTextPayload: createWorkerTextPayload,
    postRequest: postWorkerRequest,
    readText: readWorkerText,
    readTextField: readWorkerTextField,
  } = workerClient;
  const callbacksRef = useJsonWorkerCallbacksRef({
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
  const interactiveFlowRef = useRef<ReturnType<typeof createJsonWorkerInteractiveFlow> | null>(null);
  interactiveFlowRef.current ??= createJsonWorkerInteractiveFlow({
    activeTabIdRef,
    createWorkerTextPayload,
    getCallbacks: () => callbacksRef.current,
    postWorkerRequest,
    readWorkerTextField,
    structureStatusRef,
    workerRef,
    workerStructureEnabledRef,
  });
  const interactiveFlow = interactiveFlowRef.current;
  const evictedViewerCacheTabsRef = useRef(new Set<string>());
  const restoringViewerCacheTabsRef = useRef(new Set<string>());
  const recoverFormatRequestsRef = useRef<(tabIds: string[]) => void>(() => undefined);
  const [workerGeneration, setWorkerGeneration] = useState(0);

  const clearPendingFormat = useCallback((tabId: string) => {
    const timeoutId = formatTimersRef.current[tabId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete formatTimersRef.current[tabId];
    }
  }, []);

  const clearFormatWatchdog = useCallback((tabId: string) => {
    const timeoutId = formatWatchdogTimersRef.current[tabId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete formatWatchdogTimersRef.current[tabId];
    }
  }, []);

  const cancelInteractiveRequests = (tabId: string) => {
    interactiveFlow.cancelRequests(tabId);
  };

  const clearTabStructure = (tabId: string, status: StructureStatus = 'ready') => {
    workerStructureEnabledRef.current[tabId] = false;
    cancelInteractiveRequests(tabId);
    postWorkerRequest({
      type: 'clear-locate-cache',
      tabId,
    });
    callbacksRef.current.setStructureStatus(tabId, status);
    callbacksRef.current.setProcessingStage(tabId, 'idle');
  };

  const clearTabCache = (tabId: string, status: StructureStatus = 'ready') => {
    workerStructureEnabledRef.current[tabId] = false;
    cancelInteractiveRequests(tabId);
    postWorkerRequest({
      type: 'clear-tab-cache',
      tabId,
    });
    callbacksRef.current.setStructureStatus(tabId, status);
    callbacksRef.current.setProcessingStage(tabId, 'idle');
  };

  const releaseTransientWorkerCaches = useCallback(
    (tabId: string) => {
      interactiveFlow.cancelRequests(tabId);
      delete leftSearchWorkerRevisionRef.current[tabId];
      postWorkerRequest({
        type: 'release-transient-cache',
        tabId,
      });
    },
    [interactiveFlow, leftSearchWorkerRevisionRef, postWorkerRequest]
  );

  const requestWorkerLocate = interactiveFlow.requestLocate;
  const requestWorkerSearch = interactiveFlow.requestSearch;
  const requestWorkerEditJson = interactiveFlow.requestEditJson;
  const requestWorkerEditJsonResult = interactiveFlow.requestEditJsonResult;

  const { queueFormat, queueFormatAfterEditSave, queueFormatAfterImport, queueFormatFromWorkerCache, queueRepair } =
    createJsonWorkerFormatQueue({
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
    });

  recoverFormatRequestsRef.current = (tabIds) => {
    for (const tabId of tabIds) {
      const text = rawTextByTabRef.current[tabId];
      if (!text) {
        continue;
      }

      callbacksRef.current.mutatePerformanceSession(tabId, (session) => {
        session.pendingFormat = true;
        session.status = 'running';
        session.error = null;
      });
      callbacksRef.current.logEvent('worker-recovery-format', { tabId });
      queueFormat(tabId, text, true);
    }
  };

  const recoverFormatRequests = useCallback((tabIds: string[]) => {
    recoverFormatRequestsRef.current(tabIds);
  }, []);

  const onViewerCacheEvicted = useCallback((tabId: string) => {
    restoringViewerCacheTabsRef.current.delete(tabId);
    evictedViewerCacheTabsRef.current.add(tabId);
    setWorkerGeneration((current) => current + 1);
  }, []);

  const onViewerCacheRestored = useCallback(
    (tabId: string) => {
      restoringViewerCacheTabsRef.current.delete(tabId);
      evictedViewerCacheTabsRef.current.delete(tabId);
      interactiveFlow.resumeTabRequests(tabId);
    },
    [interactiveFlow]
  );

  const onWorkerRestarted = useCallback(() => {
    restoringViewerCacheTabsRef.current.clear();
    for (const [tabId, text] of Object.entries(formattedTextByTabRef.current)) {
      if (text && largeModeRef.current[tabId]) {
        evictedViewerCacheTabsRef.current.add(tabId);
      }
    }
    setWorkerGeneration((current) => current + 1);
  }, [formattedTextByTabRef, largeModeRef]);

  const restoreWorkerTabCache = useCallback(
    ({
      tabId,
      rawText,
      rawRevision,
      formattedText,
      viewerData,
      enableDirectLocate,
    }: {
      tabId: string;
      rawText: string;
      rawRevision: number;
      formattedText: string;
      viewerData: LargeJsonViewerData | null;
      enableDirectLocate: boolean;
    }) => {
      if (
        !workerRef.current ||
        !evictedViewerCacheTabsRef.current.has(tabId) ||
        restoringViewerCacheTabsRef.current.has(tabId) ||
        !formattedText ||
        !viewerData
      ) {
        return;
      }

      const viewerLineStarts = viewerData.lineStarts.slice();

      restoringViewerCacheTabsRef.current.add(tabId);
      postWorkerRequest(
        {
          type: 'hydrate-viewer-cache',
          requestId: ++requestCounterRef.current,
          tabId,
          enableDirectLocate,
          rawRevision,
          formattedText,
          rawText: enableDirectLocate ? rawText : undefined,
          viewerData: {
            lineCount: viewerData.lineCount,
            lineStarts: viewerLineStarts,
            literalChunks: viewerData.literalChunks,
          },
        },
        [viewerLineStarts.buffer]
      );
    },
    [postWorkerRequest, requestCounterRef, workerRef]
  );

  const { removeTabArtifacts, resetTabArtifacts } = createJsonWorkerTabArtifactActions({
    callbacksRef,
    cancelInteractiveRequests,
    clearFormatWatchdog,
    clearPendingFormat,
    clearTabCache,
    formatTimersRef,
    formattedTextByTabRef,
    largeFileLocateEnabledRef,
    largeModeRef,
    latestRequestRef,
    leftViewStateByTabRef,
    postWorkerRequest,
    rawTextByTabRef,
    rawRevisionByTabRef,
    rightViewStateByTabRef,
    structureStatusRef,
    workerStructureEnabledRef,
  });

  const removeTabArtifactsWithCacheState = (tabId: string) => {
    evictedViewerCacheTabsRef.current.delete(tabId);
    restoringViewerCacheTabsRef.current.delete(tabId);
    removeTabArtifacts(tabId);
  };

  const resetTabArtifactsWithCacheState = (tabId: string) => {
    evictedViewerCacheTabsRef.current.delete(tabId);
    restoringViewerCacheTabsRef.current.delete(tabId);
    resetTabArtifacts(tabId);
  };

  const importFlowRef = useRef<ReturnType<typeof createJsonWorkerImportFlow> | null>(null);
  importFlowRef.current ??= createJsonWorkerImportFlow({
    cancelInteractiveRequests,
    getCallbacks: () => callbacksRef.current,
    largeFileLocateEnabledRef,
    postClearTabCache: (tabId) => {
      postWorkerRequest({
        type: 'clear-tab-cache',
        tabId,
      });
    },
    queueFormatAfterImport,
    workerStructureEnabledRef,
  });
  const { importJsonFile, importJsonText } = importFlowRef.current;

  useJsonWorkerLifecycle({
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
  });

  return {
    clearTabStructure,
    importJsonFile,
    importJsonText,
    queueFormat,
    queueFormatFromWorkerCache,
    queueRepair,
    queueFormatAfterEditSave,
    releaseTransientWorkerCaches,
    restoreWorkerTabCache,
    removeTabArtifacts: removeTabArtifactsWithCacheState,
    requestWorkerSearch,
    requestWorkerLocate,
    requestWorkerEditJson,
    requestWorkerEditJsonResult,
    resetTabArtifacts: resetTabArtifactsWithCacheState,
    workerGeneration,
  };
}
