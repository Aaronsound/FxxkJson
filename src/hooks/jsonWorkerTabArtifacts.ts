import type { MutableRefObject } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { WorkerRequestMessage } from '../types/jsonTool';
import { disposeModel, getLeftModelPath, getRightModelPath } from '../utils/jsonToolModels';
import type { JsonWorkerCallbacks } from './useJsonWorkerCallbacksRef';

interface CreateJsonWorkerTabArtifactActionsArgs {
  callbacksRef: MutableRefObject<JsonWorkerCallbacks>;
  cancelInteractiveRequests: (tabId: string) => void;
  clearPendingFormat: (tabId: string) => void;
  clearTabStructure: (tabId: string, status?: 'ready' | 'building' | 'disabled') => void;
  formatTimersRef: MutableRefObject<Record<string, number>>;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  latestRequestRef: MutableRefObject<Record<string, number>>;
  leftViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  postWorkerRequest: (message: WorkerRequestMessage, transfer?: Transferable[]) => void;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  rightViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  structureStatusRef: MutableRefObject<Record<string, 'ready' | 'building' | 'disabled'>>;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
}

export function createJsonWorkerTabArtifactActions({
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
}: CreateJsonWorkerTabArtifactActionsArgs) {
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

  return { removeTabArtifacts, resetTabArtifacts };
}
