import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeRawViewerData,
  LargeViewerStatus,
  LocateFeedback,
  ProcessingStage,
  RightNodeSelection,
  StructureStatus,
  TabDocumentMeta,
} from '../types/jsonTool';
import { getUtf8ByteLength } from '../utils/jsonDocumentMetrics';

interface UseJsonToolStateSettersArgs {
  activeTabIdRef: MutableRefObject<string>;
  clearLeftHighlights: () => void;
  clearRightHighlights: () => void;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  largeViewerMatches: LargeJsonSearchMatch[];
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  resetLeftSearchState: () => void;
  resetRightSearchPaging: () => void;
  resetRightSearchState: () => void;
  setDocumentMeta: (tabId: string, updater: (current: TabDocumentMeta) => TabDocumentMeta) => void;
  setIsRightSearchLoadingMore: (loading: boolean) => void;
  setLargeFileLocateEnabledState: (tabId: string, enabled: boolean) => void;
  setLargeRawViewerDataByTab: Dispatch<SetStateAction<Record<string, LargeRawViewerData | null>>>;
  setLargeRawViewerMatches: (matches: LargeJsonSearchMatch[]) => void;
  setLargeViewerCollapsedLinesByTab: Dispatch<SetStateAction<Record<string, number[]>>>;
  setLargeViewerDataByTab: Dispatch<SetStateAction<Record<string, LargeJsonViewerData | null>>>;
  setLargeViewerMatchCount: (count: number) => void;
  setLargeViewerMatches: (matches: LargeJsonSearchMatch[]) => void;
  setLargeViewerStatusByTab: Dispatch<SetStateAction<Record<string, LargeViewerStatus>>>;
  setLeftReplaceText: (text: string) => void;
  setLocateFeedbackByTab: Dispatch<SetStateAction<Record<string, LocateFeedback | null>>>;
  setProcessingStageByTab: Dispatch<SetStateAction<Record<string, ProcessingStage>>>;
  setRightNodeSelectionByTab: Dispatch<SetStateAction<Record<string, RightNodeSelection | null>>>;
  setRightSearchHasMore: (hasMore: boolean) => void;
  setRightSearchNextOffset: (offset: number) => void;
  setStructureStatusState: (tabId: string, status: StructureStatus) => void;
  setTabLargeModeState: (tabId: string, enabled: boolean) => void;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
  syncLeftModel: (tabId: string, content: string, forceValue?: boolean) => void;
  syncRightModel: (tabId: string, content: string, forceValue?: boolean) => void;
}

export function useJsonToolStateSetters({
  activeTabIdRef,
  clearLeftHighlights,
  clearRightHighlights,
  formattedTextByTabRef,
  largeFileLocateEnabledRef,
  largeModeRef,
  largeViewerMatches,
  rawTextByTabRef,
  resetLeftSearchState,
  resetRightSearchPaging,
  resetRightSearchState,
  setDocumentMeta,
  setIsRightSearchLoadingMore,
  setLargeFileLocateEnabledState,
  setLargeRawViewerDataByTab,
  setLargeRawViewerMatches,
  setLargeViewerCollapsedLinesByTab,
  setLargeViewerDataByTab,
  setLargeViewerMatchCount,
  setLargeViewerMatches,
  setLargeViewerStatusByTab,
  setLeftReplaceText,
  setLocateFeedbackByTab,
  setProcessingStageByTab,
  setRightNodeSelectionByTab,
  setRightSearchHasMore,
  setRightSearchNextOffset,
  setStructureStatusState,
  setTabLargeModeState,
  structureStatusRef,
  syncLeftModel,
  syncRightModel,
}: UseJsonToolStateSettersArgs) {
  const resetSearchState = () => {
    resetLeftSearchState();
    resetRightSearchState();
    setLeftReplaceText('');
    setLargeRawViewerMatches([]);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    clearLeftHighlights();
    clearRightHighlights();
  };

  const setTabLargeMode = (tabId: string, enabled: boolean) => {
    largeModeRef.current[tabId] = enabled;
    setTabLargeModeState(tabId, enabled);
  };

  const setProcessingStage = (tabId: string, stage: ProcessingStage) => {
    setProcessingStageByTab((current) => ({ ...current, [tabId]: stage }));
  };

  const setLocateFeedback = (tabId: string, feedback: LocateFeedback | null) => {
    setLocateFeedbackByTab((current) => ({ ...current, [tabId]: feedback }));
  };

  const setRightNodeSelection = (tabId: string, selection: RightNodeSelection | null) => {
    setRightNodeSelectionByTab((current) => ({ ...current, [tabId]: selection }));
  };

  const setLargeFileLocateEnabled = (tabId: string, enabled: boolean) => {
    largeFileLocateEnabledRef.current[tabId] = enabled;
    setLargeFileLocateEnabledState(tabId, enabled);
  };

  const setStructureStatus = (tabId: string, status: StructureStatus) => {
    structureStatusRef.current[tabId] = status;
    setStructureStatusState(tabId, status);
  };

  const setLargeViewerData = (tabId: string, data: LargeJsonViewerData | null) => {
    setLargeViewerDataByTab((current) => ({ ...current, [tabId]: data }));
    setLargeViewerCollapsedLinesByTab((current) => ({ ...current, [tabId]: [] }));
    setRightNodeSelection(tabId, null);
    if (tabId === activeTabIdRef.current) {
      setLargeViewerMatches([]);
      setLargeViewerMatchCount(0);
      resetRightSearchPaging();
    }
  };

  const setLargeRawViewerData = (tabId: string, data: LargeRawViewerData | null) => {
    setLargeRawViewerDataByTab((current) => ({ ...current, [tabId]: data }));
  };

  const setLargeViewerStatus = (tabId: string, status: LargeViewerStatus) => {
    setLargeViewerStatusByTab((current) => ({ ...current, [tabId]: status }));
  };

  const setLargeViewerSearchResults = (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore = false,
    nextStartOffset = 0,
    append = false
  ) => {
    if (tabId !== activeTabIdRef.current) {
      return;
    }

    const nextMatches = append ? [...largeViewerMatches, ...matches] : matches;
    setLargeViewerMatches(nextMatches);
    setLargeViewerMatchCount(nextMatches.length);
    setRightSearchHasMore(hasMore);
    setRightSearchNextOffset(nextStartOffset);
    setIsRightSearchLoadingMore(false);
  };

  const getTabContent = (tabId: string) => rawTextByTabRef.current[tabId] ?? '';

  const updateTabContent = (tabId: string, content: string, syncModel = false) => {
    const byteLength = getUtf8ByteLength(content);
    rawTextByTabRef.current[tabId] = content;
    setLargeRawViewerData(tabId, null);
    setRightNodeSelection(tabId, null);
    setDocumentMeta(tabId, (current) => ({
      ...current,
      rawLength: byteLength,
      rawRevision: current.rawRevision + 1,
    }));

    if (syncModel) {
      syncLeftModel(tabId, content, true);
    }
  };

  const updateFormattedContent = (tabId: string, content: string, syncModel = false) => {
    const byteLength = getUtf8ByteLength(content);
    formattedTextByTabRef.current[tabId] = content;
    setRightNodeSelection(tabId, null);
    setDocumentMeta(tabId, (current) => ({
      ...current,
      formattedLength: byteLength,
      formattedRevision: current.formattedRevision + 1,
    }));

    if (syncModel) {
      syncRightModel(tabId, content, true);
    }
  };

  return {
    getTabContent,
    resetSearchState,
    setLargeFileLocateEnabled,
    setLargeRawViewerData,
    setLargeViewerData,
    setLargeViewerSearchResults,
    setLargeViewerStatus,
    setLocateFeedback,
    setProcessingStage,
    setRightNodeSelection,
    setStructureStatus,
    setTabLargeMode,
    updateFormattedContent,
    updateTabContent,
  };
}
