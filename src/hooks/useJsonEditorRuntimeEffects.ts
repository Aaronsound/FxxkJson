import { useEffect, type MutableRefObject } from 'react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { LargeJsonViewerData, LargeViewerStatus, Tab } from '../types/jsonTool';
import { getMonacoOptions } from '../utils/jsonEditorInteractions';

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
  leftEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  logRightEditorState: (event: string, tabId: string, extra?: Record<string, unknown>) => void;
  rightEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  shouldEnableRightPaneFolding: boolean;
  shouldUseDedicatedLeftViewer: boolean;
  shouldUseDedicatedRightViewer: boolean;
  syncLeftModel: (tabId: string, content: string, forceValue?: boolean) => void;
  syncRightModel: (tabId: string, content: string, forceValue?: boolean) => void;
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
  leftEditorRef,
  logRightEditorState,
  rightEditorRef,
  shouldEnableRightPaneFolding,
  shouldUseDedicatedLeftViewer,
  shouldUseDedicatedRightViewer,
  syncLeftModel,
  syncRightModel,
  wrapLongLines,
}: UseJsonEditorRuntimeEffectsArgs) {
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId, activeTabIdRef]);

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    const currentRaw = getTabContent(activeTab.id);
    const currentFormatted = formattedTextByTabRef.current[activeTab.id] ?? '';
    syncLeftModel(activeTab.id, currentRaw);
    syncRightModel(activeTab.id, currentFormatted);
  }, [
    activeDocumentMeta.formattedLength,
    activeDocumentMeta.rawLength,
    activeLargeViewerData,
    activeLargeViewerStatus,
    activeTab,
  ]);

  useEffect(() => {
    if (!shouldUseDedicatedLeftViewer) {
      leftEditorRef.current?.updateOptions(
        getMonacoOptions({
          largeMode: isLargeFileMode,
          wrapLongLines,
        })
      );
      leftEditorRef.current?.layout();
    }
    if (!shouldUseDedicatedRightViewer && !isBuildingDedicatedRightViewer) {
      rightEditorRef.current?.updateOptions(
        getMonacoOptions({
          largeMode: isLargeFileMode,
          wrapLongLines,
          readOnly: true,
          enableStructuralFolding: shouldEnableRightPaneFolding,
        })
      );
      rightEditorRef.current?.layout();
    }
    if (activeTab && !shouldUseDedicatedRightViewer) {
      logRightEditorState(
        activeTab.id === activeTabId ? 'right-editor-options-refreshed' : 'right-editor-options-skipped',
        activeTab.id,
        {
          isLargeFileMode,
          shouldEnableRightPaneFolding,
          wrapLongLines,
        }
      );
    }
  }, [
    activeTab,
    activeTabId,
    isBuildingDedicatedRightViewer,
    isLargeFileMode,
    shouldEnableRightPaneFolding,
    shouldUseDedicatedLeftViewer,
    shouldUseDedicatedRightViewer,
    wrapLongLines,
  ]);
}
