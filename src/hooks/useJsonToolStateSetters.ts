import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react';
import type {
  LargeJsonFoldState,
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
import { EMPTY_LARGE_JSON_FOLD_STATE } from '../types/jsonTool';
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
  rawRevisionByTabRef: MutableRefObject<Record<string, number>>;
  resetLeftSearchState: () => void;
  resetRightSearchPaging: () => void;
  resetRightSearchState: () => void;
  setDocumentMeta: (tabId: string, updater: (current: TabDocumentMeta) => TabDocumentMeta) => void;
  setIsRightSearchLoadingMore: (loading: boolean) => void;
  setLargeFileLocateEnabledState: (tabId: string, enabled: boolean) => void;
  setLargeRawViewerDataByTab: Dispatch<SetStateAction<Record<string, LargeRawViewerData | null>>>;
  setLargeRawViewerMatches: (matches: LargeJsonSearchMatch[]) => void;
  setLargeViewerFoldStateByTab: Dispatch<SetStateAction<Record<string, LargeJsonFoldState>>>;
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
  syncLeftModel: (tabId: string, content: string, forceValue?: boolean, byteLength?: number) => void;
  syncRightModel: (
    tabId: string,
    content: string,
    forceValue?: boolean,
    byteLength?: number,
    rawByteLength?: number
  ) => void;
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
  rawRevisionByTabRef,
  resetLeftSearchState,
  resetRightSearchPaging,
  resetRightSearchState,
  setDocumentMeta,
  setIsRightSearchLoadingMore,
  setLargeFileLocateEnabledState,
  setLargeRawViewerDataByTab,
  setLargeRawViewerMatches,
  setLargeViewerFoldStateByTab,
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
  const resetSearchState = useCallback(() => {
    resetLeftSearchState();
    resetRightSearchState();
    setLeftReplaceText('');
    setLargeRawViewerMatches([]);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    clearLeftHighlights();
    clearRightHighlights();
  }, [
    clearLeftHighlights,
    clearRightHighlights,
    resetLeftSearchState,
    resetRightSearchState,
    setLargeRawViewerMatches,
    setLargeViewerMatchCount,
    setLargeViewerMatches,
    setLeftReplaceText,
  ]);

  const setTabLargeMode = useCallback(
    (tabId: string, enabled: boolean) => {
      largeModeRef.current[tabId] = enabled;
      setTabLargeModeState(tabId, enabled);
    },
    [largeModeRef, setTabLargeModeState]
  );

  const setProcessingStage = useCallback(
    (tabId: string, stage: ProcessingStage) => {
      setProcessingStageByTab((current) => ({ ...current, [tabId]: stage }));
    },
    [setProcessingStageByTab]
  );

  const setLocateFeedback = useCallback(
    (tabId: string, feedback: LocateFeedback | null) => {
      setLocateFeedbackByTab((current) => ({ ...current, [tabId]: feedback }));
    },
    [setLocateFeedbackByTab]
  );

  const setRightNodeSelection = useCallback(
    (tabId: string, selection: RightNodeSelection | null) => {
      setRightNodeSelectionByTab((current) => ({ ...current, [tabId]: selection }));
    },
    [setRightNodeSelectionByTab]
  );

  const setLargeFileLocateEnabled = useCallback(
    (tabId: string, enabled: boolean) => {
      largeFileLocateEnabledRef.current[tabId] = enabled;
      setLargeFileLocateEnabledState(tabId, enabled);
    },
    [largeFileLocateEnabledRef, setLargeFileLocateEnabledState]
  );

  const setStructureStatus = useCallback(
    (tabId: string, status: StructureStatus) => {
      structureStatusRef.current[tabId] = status;
      setStructureStatusState(tabId, status);
    },
    [setStructureStatusState, structureStatusRef]
  );

  const setLargeViewerData = useCallback(
    (tabId: string, data: LargeJsonViewerData | null) => {
      setLargeViewerDataByTab((current) => ({ ...current, [tabId]: data }));
      setLargeViewerFoldStateByTab((current) => ({ ...current, [tabId]: EMPTY_LARGE_JSON_FOLD_STATE }));
      setRightNodeSelection(tabId, null);
      if (tabId === activeTabIdRef.current) {
        setLargeViewerMatches([]);
        setLargeViewerMatchCount(0);
        resetRightSearchPaging();
      }
    },
    [
      activeTabIdRef,
      resetRightSearchPaging,
      setLargeViewerDataByTab,
      setLargeViewerFoldStateByTab,
      setLargeViewerMatchCount,
      setLargeViewerMatches,
      setRightNodeSelection,
    ]
  );

  const setLargeRawViewerData = useCallback(
    (tabId: string, data: LargeRawViewerData | null) => {
      setLargeRawViewerDataByTab((current) => ({ ...current, [tabId]: data }));
    },
    [setLargeRawViewerDataByTab]
  );

  const setLargeViewerStatus = useCallback(
    (tabId: string, status: LargeViewerStatus) => {
      setLargeViewerStatusByTab((current) => ({ ...current, [tabId]: status }));
    },
    [setLargeViewerStatusByTab]
  );

  const setLargeViewerSearchResults = useCallback(
    (tabId: string, matches: LargeJsonSearchMatch[], hasMore = false, nextStartOffset = 0, append = false) => {
      if (tabId !== activeTabIdRef.current) {
        return;
      }

      const nextMatches = append ? [...largeViewerMatches, ...matches] : matches;
      setLargeViewerMatches(nextMatches);
      setLargeViewerMatchCount(nextMatches.length);
      setRightSearchHasMore(hasMore);
      setRightSearchNextOffset(nextStartOffset);
      setIsRightSearchLoadingMore(false);
    },
    [
      activeTabIdRef,
      largeViewerMatches,
      setIsRightSearchLoadingMore,
      setLargeViewerMatchCount,
      setLargeViewerMatches,
      setRightSearchHasMore,
      setRightSearchNextOffset,
    ]
  );

  const getTabContent = useCallback((tabId: string) => rawTextByTabRef.current[tabId] ?? '', [rawTextByTabRef]);
  const getFormattedContent = useCallback(
    (tabId: string) => formattedTextByTabRef.current[tabId] ?? '',
    [formattedTextByTabRef]
  );
  const getRawRevision = useCallback((tabId: string) => rawRevisionByTabRef.current[tabId] ?? 0, [rawRevisionByTabRef]);

  const updateTabContent = useCallback(
    (tabId: string, content: string, syncModel = false, knownByteLength?: number) => {
      const byteLength = knownByteLength ?? getUtf8ByteLength(content);
      const rawRevision = getRawRevision(tabId) + 1;
      rawTextByTabRef.current[tabId] = content;
      rawRevisionByTabRef.current[tabId] = rawRevision;
      setLargeRawViewerData(tabId, null);
      setRightNodeSelection(tabId, null);
      setDocumentMeta(tabId, (current) => ({
        ...current,
        rawLength: byteLength,
        rawRevision,
      }));

      if (syncModel) {
        syncLeftModel(tabId, content, true, byteLength);
      }
    },
    [
      getRawRevision,
      rawRevisionByTabRef,
      rawTextByTabRef,
      setDocumentMeta,
      setLargeRawViewerData,
      setRightNodeSelection,
      syncLeftModel,
    ]
  );

  const updateFormattedContent = useCallback(
    (tabId: string, content: string, syncModel = false, knownByteLength?: number, knownRawByteLength?: number) => {
      const byteLength = knownByteLength ?? getUtf8ByteLength(content);
      formattedTextByTabRef.current[tabId] = content;
      setRightNodeSelection(tabId, null);
      setDocumentMeta(tabId, (current) => ({
        ...current,
        formattedLength: byteLength,
        formattedRevision: current.formattedRevision + 1,
        formattedRawRevision: current.rawRevision,
      }));

      if (syncModel) {
        syncRightModel(tabId, content, true, byteLength, knownRawByteLength);
      }
    },
    [formattedTextByTabRef, setDocumentMeta, setRightNodeSelection, syncRightModel]
  );

  return {
    getFormattedContent,
    getRawRevision,
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
