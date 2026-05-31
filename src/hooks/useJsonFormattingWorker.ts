import { MutableRefObject, useCallback, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
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
import { PerformanceSession } from './useJsonPerformanceTracking';
import { createJsonWorkerInteractiveFlow } from './jsonWorkerInteractiveFlow';
import { createJsonWorkerImportFlow } from './jsonWorkerImportFlow';
import { useJsonWorkerLifecycle } from './useJsonWorkerLifecycle';
import { createJsonWorkerFormatQueue } from './jsonWorkerFormatQueue';
import { useJsonWorkerCallbacksRef } from './useJsonWorkerCallbacksRef';
import { useJsonWorkerInternalRefs } from './useJsonWorkerInternalRefs';
import { createJsonWorkerTabArtifactActions } from './jsonWorkerTabArtifacts';

export interface UseJsonFormattingWorkerArgs {
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
    formattedTextByTabRef,
    getCallbacks: () => callbacksRef.current,
    postWorkerRequest,
    structureStatusRef,
    workerRef,
    workerStructureEnabledRef,
  });
  const interactiveFlow = interactiveFlowRef.current;

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

  const { queueFormat, queueFormatAfterEditSave, queueFormatAfterImport, queueRepair } = createJsonWorkerFormatQueue({
    callbacksRef,
    clearFormatWatchdog,
    cancelInteractiveRequests,
    clearPendingFormat,
    clearTabStructure,
    createWorkerTextPayload,
    formatWatchdogTimersRef,
    formatTimersRef,
    largeFileLocateEnabledRef,
    largeModeRef,
    latestRequestRef,
    postWorkerRequest,
    requestCounterRef,
    workerStructureEnabledRef,
  });

  const { removeTabArtifacts, resetTabArtifacts } = createJsonWorkerTabArtifactActions({
    callbacksRef,
    cancelInteractiveRequests,
    clearPendingFormat,
    clearTabStructure,
    formatTimersRef,
    formattedTextByTabRef,
    largeFileLocateEnabledRef,
    largeModeRef,
    latestRequestRef,
    leftViewStateByTabRef,
    postWorkerRequest,
    rawTextByTabRef,
    rightViewStateByTabRef,
    structureStatusRef,
    workerStructureEnabledRef,
  });

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

  useJsonWorkerLifecycle({
    callbacksRef,
    clearFormatWatchdog,
    clearPendingFormat,
    formatWatchdogTimersRef,
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
  });

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
