import { useEffect, type MutableRefObject } from 'react';
import type { LargeJsonViewerData, LargeViewerStatus, Tab } from '../types/jsonTool';

interface UseJsonEditorRuntimeEffectsArgs {
  activeDocumentMeta: {
    formattedLength: number;
    rawLength: number;
  };
  activeLargeViewerData: LargeJsonViewerData | null;
  activeLargeViewerStatus: LargeViewerStatus;
  activeTab: Tab | null | undefined;
  activeTabId: string;
  activeTabIdRef: MutableRefObject<string>;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  getTabContent: (tabId: string) => string;
  isBuildingDedicatedRightViewer: boolean;
  isLargeFileMode: boolean;
  logRightEditorState: (event: string, tabId: string, extra?: Record<string, unknown>) => void;
  shouldEnableRightPaneFolding: boolean;
  shouldUseDedicatedRightViewer: boolean;
  syncLeftModel: (tabId: string, content: string, forceValue?: boolean, byteLength?: number) => void;
  syncRightModel: (
    tabId: string,
    content: string,
    forceValue?: boolean,
    byteLength?: number,
    rawByteLength?: number
  ) => void;
  wrapLongLines: boolean;
}

export function useJsonEditorRuntimeEffects({
  activeDocumentMeta,
  activeLargeViewerData,
  activeLargeViewerStatus,
  activeTab,
  activeTabId,
  activeTabIdRef,
  formattedTextByTabRef,
  getTabContent,
  isBuildingDedicatedRightViewer,
  isLargeFileMode,
  logRightEditorState,
  shouldEnableRightPaneFolding,
  shouldUseDedicatedRightViewer,
  syncLeftModel,
  syncRightModel,
  wrapLongLines,
}: UseJsonEditorRuntimeEffectsArgs) {
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId, activeTabIdRef]);

  useEffect(() => {
    // Viewer artifacts are explicit synchronization triggers even though the
    // editor models consume their corresponding text and length metadata.
    void activeLargeViewerData;
    void activeLargeViewerStatus;
    if (!activeTab) {
      return;
    }

    const currentRaw = getTabContent(activeTab.id);
    const currentFormatted = formattedTextByTabRef.current[activeTab.id] ?? '';
    syncLeftModel(activeTab.id, currentRaw, false, activeDocumentMeta.rawLength);
    syncRightModel(
      activeTab.id,
      currentFormatted,
      false,
      activeDocumentMeta.formattedLength,
      activeDocumentMeta.rawLength
    );
  }, [
    activeDocumentMeta.formattedLength,
    activeDocumentMeta.rawLength,
    activeLargeViewerData,
    activeLargeViewerStatus,
    activeTab,
    formattedTextByTabRef,
    getTabContent,
    syncLeftModel,
    syncRightModel,
  ]);

  useEffect(() => {
    if (activeTab && !shouldUseDedicatedRightViewer && !isBuildingDedicatedRightViewer) {
      logRightEditorState(
        activeTab.id === activeTabId ? 'right-editor-options-refreshed' : 'right-editor-options-skipped',
        activeTab.id,
        {
          formattedBytes: activeDocumentMeta.formattedLength,
          rawBytes: activeDocumentMeta.rawLength,
          isLargeFileMode,
          shouldEnableRightPaneFolding,
          wrapLongLines,
        }
      );
    }
  }, [
    activeDocumentMeta.formattedLength,
    activeDocumentMeta.rawLength,
    activeTab,
    activeTabId,
    isBuildingDedicatedRightViewer,
    isLargeFileMode,
    logRightEditorState,
    shouldEnableRightPaneFolding,
    shouldUseDedicatedRightViewer,
    wrapLongLines,
  ]);
}
