import { useState } from 'react';
import type {
  LargeJsonViewerData,
  LargeRawViewerData,
  LargeViewerStatus,
  LocateFeedback,
  ProcessingStage,
  RightNodeSelection,
} from '../types/jsonTool';

function removeRecordEntry<T>(record: Record<string, T>, tabId: string) {
  const next = { ...record };
  delete next[tabId];
  return next;
}

export function useJsonTabArtifacts(initialTabId: string) {
  const [largeViewerDataByTab, setLargeViewerDataByTab] = useState<Record<string, LargeJsonViewerData | null>>({
    [initialTabId]: null,
  });
  const [largeRawViewerDataByTab, setLargeRawViewerDataByTab] = useState<Record<string, LargeRawViewerData | null>>({
    [initialTabId]: null,
  });
  const [largeViewerStatusByTab, setLargeViewerStatusByTab] = useState<Record<string, LargeViewerStatus>>({
    [initialTabId]: 'idle',
  });
  const [largeViewerCollapsedLinesByTab, setLargeViewerCollapsedLinesByTab] = useState<Record<string, number[]>>({
    [initialTabId]: [],
  });
  const [processingStageByTab, setProcessingStageByTab] = useState<Record<string, ProcessingStage>>({
    [initialTabId]: 'idle',
  });
  const [locateFeedbackByTab, setLocateFeedbackByTab] = useState<Record<string, LocateFeedback | null>>({
    [initialTabId]: null,
  });
  const [rightNodeSelectionByTab, setRightNodeSelectionByTab] = useState<Record<string, RightNodeSelection | null>>({
    [initialTabId]: null,
  });

  const initializeTabArtifacts = (tabId: string) => {
    setLargeViewerDataByTab((current) => ({ ...current, [tabId]: null }));
    setLargeRawViewerDataByTab((current) => ({ ...current, [tabId]: null }));
    setLargeViewerStatusByTab((current) => ({ ...current, [tabId]: 'idle' }));
    setLargeViewerCollapsedLinesByTab((current) => ({ ...current, [tabId]: [] }));
    setProcessingStageByTab((current) => ({ ...current, [tabId]: 'idle' }));
    setLocateFeedbackByTab((current) => ({ ...current, [tabId]: null }));
    setRightNodeSelectionByTab((current) => ({ ...current, [tabId]: null }));
  };

  const removeTabArtifactsState = (tabId: string) => {
    setLargeViewerDataByTab((current) => removeRecordEntry(current, tabId));
    setLargeRawViewerDataByTab((current) => removeRecordEntry(current, tabId));
    setLargeViewerStatusByTab((current) => removeRecordEntry(current, tabId));
    setLargeViewerCollapsedLinesByTab((current) => removeRecordEntry(current, tabId));
    setProcessingStageByTab((current) => removeRecordEntry(current, tabId));
    setLocateFeedbackByTab((current) => removeRecordEntry(current, tabId));
    setRightNodeSelectionByTab((current) => removeRecordEntry(current, tabId));
  };

  return {
    initializeTabArtifacts,
    largeRawViewerDataByTab,
    largeViewerCollapsedLinesByTab,
    largeViewerDataByTab,
    largeViewerStatusByTab,
    locateFeedbackByTab,
    processingStageByTab,
    removeTabArtifactsState,
    rightNodeSelectionByTab,
    setLargeRawViewerDataByTab,
    setLargeViewerCollapsedLinesByTab,
    setLargeViewerDataByTab,
    setLargeViewerStatusByTab,
    setLocateFeedbackByTab,
    setProcessingStageByTab,
    setRightNodeSelectionByTab,
  };
}
