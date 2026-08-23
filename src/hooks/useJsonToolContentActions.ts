import type { MutableRefObject } from 'react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { EditJsonWorkerOperation, EditJsonWorkerRequest, StructureStatus, Tab } from '../types/jsonTool';
import { DEFAULT_TAB_TITLE } from '../types/jsonTool';
import {
  type JsonDocumentMetrics,
  measureJsonDocument,
  shouldUseLargeModeForMetrics,
} from '../utils/jsonDocumentMetrics';

type EscapeOperation = Extract<EditJsonWorkerOperation, 'escape-json' | 'unescape-json'>;

interface UseJsonToolContentActionsArgs {
  activeTab: Tab | null;
  beginPerformanceSession: (
    tabId: string,
    trigger: 'manual-format' | 'repair',
    label: string,
    fileSize: number | null,
    rawBytes: number,
    largeMode: boolean
  ) => void;
  clearPerformanceState: (tabId: string) => void;
  clearTabStructure: (tabId: string, status?: StructureStatus) => void;
  getTabContent: (tabId: string) => string;
  leftEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  leftSearchWorkerRevisionRef: MutableRefObject<Record<string, number>>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  openDocumentEditSession: (value: string) => void;
  queueFormat: (tabId: string, text: string, immediate?: boolean, metrics?: JsonDocumentMetrics) => void;
  queueRepair: (tabId: string, text: string, metrics?: JsonDocumentMetrics) => void;
  renameTab: (tabId: string, title: string) => void;
  requestWorkerEditJson: (request: EditJsonWorkerRequest) => Promise<string>;
  resetSearchState: () => void;
  resetTabArtifacts: (tabId: string) => void;
  setEditJsonBusyLabel: (label: string | null) => void;
  setLargeFileLocateEnabled: (tabId: string, enabled: boolean) => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
  setTabError: (tabId: string, error: string | null) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean, byteLength?: number) => void;
}

export function useJsonToolContentActions({
  activeTab,
  beginPerformanceSession,
  clearPerformanceState,
  clearTabStructure,
  getTabContent,
  leftEditorRef,
  leftSearchWorkerRevisionRef,
  largeModeRef,
  openDocumentEditSession,
  queueFormat,
  queueRepair,
  renameTab,
  requestWorkerEditJson,
  resetSearchState,
  resetTabArtifacts,
  setEditJsonBusyLabel,
  setLargeFileLocateEnabled,
  setStructureStatus,
  setTabError,
  setTabLargeMode,
  updateTabContent,
}: UseJsonToolContentActionsArgs) {
  const handleFormat = () => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    const metrics = measureJsonDocument(currentText);
    if (!currentText.trim()) {
      clearPerformanceState(activeTab.id);
      queueFormat(activeTab.id, currentText, true, metrics);
      return;
    }

    const largeMode = Boolean(largeModeRef.current[activeTab.id]) || shouldUseLargeModeForMetrics(metrics);
    beginPerformanceSession(activeTab.id, 'manual-format', activeTab.title, null, metrics.textByteLength, largeMode);
    setTabLargeMode(activeTab.id, largeMode);
    queueFormat(activeTab.id, currentText, true, metrics);
  };

  const handleRepairJson = () => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    if (!currentText.trim()) {
      setTabError(activeTab.id, '没有可修复的 JSON 内容');
      return;
    }

    const metrics = measureJsonDocument(currentText);
    const largeMode = shouldUseLargeModeForMetrics(metrics);
    beginPerformanceSession(activeTab.id, 'repair', activeTab.title, null, metrics.textByteLength, largeMode);
    setTabLargeMode(activeTab.id, largeMode);
    queueRepair(activeTab.id, currentText, metrics);
  };

  const handleJsonEscapeTransform = async (operation: EscapeOperation, label: string) => {
    if (!activeTab) {
      return;
    }

    const currentTabId = activeTab.id;
    const editor = leftEditorRef.current;
    const model = editor?.getModel() ?? null;
    const selection = editor?.getSelection() ?? null;
    const hasSelection = Boolean(model && selection && !selection.isEmpty());
    const sourceText =
      hasSelection && model && selection ? model.getValueInRange(selection) : getTabContent(currentTabId);

    if (!sourceText.trim()) {
      setTabError(currentTabId, `没有可${label}的内容`);
      return;
    }

    setEditJsonBusyLabel(`正在${label}...`);
    try {
      const transformed = await requestWorkerEditJson({ tabId: currentTabId, operation, text: sourceText });
      setTabError(currentTabId, null);

      if (hasSelection && editor && selection) {
        editor.executeEdits('json-escape-transform', [
          {
            range: selection,
            text: transformed,
            forceMoveMarkers: true,
          },
        ]);
        resetSearchState();
        return;
      }

      const metrics = measureJsonDocument(transformed);
      setTabLargeMode(currentTabId, shouldUseLargeModeForMetrics(metrics));
      updateTabContent(currentTabId, transformed, true, metrics.textByteLength);
      resetSearchState();
      queueFormat(currentTabId, transformed, true, metrics);
    } catch (error) {
      setTabError(currentTabId, error instanceof Error ? `${label}失败：${error.message}` : `${label}失败`);
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleUnescapeJson = () => {
    void handleJsonEscapeTransform('unescape-json', '反转义');
  };

  const handleEscapeJson = () => {
    void handleJsonEscapeTransform('escape-json', '转义');
  };

  const handleOpenEditJson = async () => {
    if (!activeTab) {
      return;
    }

    setEditJsonBusyLabel('正在准备编辑内容...');
    try {
      const raw = getTabContent(activeTab.id);
      const formatted = await requestWorkerEditJson({ tabId: activeTab.id, operation: 'format', text: raw });
      openDocumentEditSession(formatted);
    } catch (error) {
      setTabError(activeTab.id, error instanceof Error ? `打开 JSON 编辑失败：${error.message}` : '打开 JSON 编辑失败');
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleLargeFileLocateToggle = (enabled: boolean) => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    const metrics = measureJsonDocument(currentText);
    const largeMode = shouldUseLargeModeForMetrics(metrics);
    setLargeFileLocateEnabled(activeTab.id, enabled);

    if (!currentText.trim()) {
      setStructureStatus(activeTab.id, 'ready');
      return;
    }

    if (!enabled) {
      clearTabStructure(activeTab.id, largeMode ? 'disabled' : 'ready');
      return;
    }

    queueFormat(activeTab.id, currentText, true, metrics);
  };

  const handleClear = () => {
    if (!activeTab) {
      return;
    }

    renameTab(activeTab.id, DEFAULT_TAB_TITLE);
    delete leftSearchWorkerRevisionRef.current[activeTab.id];
    resetTabArtifacts(activeTab.id);
    resetSearchState();
  };

  return {
    handleClear,
    handleEscapeJson,
    handleFormat,
    handleLargeFileLocateToggle,
    handleOpenEditJson,
    handleRepairJson,
    handleUnescapeJson,
  };
}
