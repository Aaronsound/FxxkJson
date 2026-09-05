import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { MutableRefObject } from 'react';
import type {
  EditJsonWorkerOperation,
  EditJsonWorkerRequest,
  LargeJsonViewerData,
  LargeRawViewerData,
  StructureStatus,
  Tab,
  TabDocumentMeta,
  WorkerMessage,
} from '../types/jsonTool';
import { DEFAULT_TAB_TITLE, LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import {
  type JsonDocumentMetrics,
  measureJsonDocument,
  measureJsonDocumentWithKnownByteLength,
  shouldUseLargeModeForMetrics,
} from '../utils/jsonDocumentMetrics';
import { buildEscapedStringLiteralRawViewerData } from '../utils/largeRawViewerData';
import { JsonValidationError, type JsonErrorLocation } from '../utils/jsonErrorLocation';

type EscapeOperation = Extract<EditJsonWorkerOperation, 'escape-json' | 'unescape-json'>;

function isFormattedJsonContainer(text: string) {
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

interface UseJsonToolContentActionsArgs {
  activeTab: Tab | null;
  activeDocumentMeta: TabDocumentMeta;
  currentErrorLocation?: JsonErrorLocation;
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
  getFormattedContent: (tabId: string) => string;
  leftEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  leftSearchWorkerRevisionRef: MutableRefObject<Record<string, number>>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  openDocumentEditSession: (value: string, location?: JsonErrorLocation) => void;
  queueFormat: (
    tabId: string,
    text: string,
    immediate?: boolean,
    metrics?: JsonDocumentMetrics,
    delayMs?: number
  ) => void;
  queueFormatFromWorkerCache: (tabId: string, text: string, metrics: JsonDocumentMetrics) => void;
  queueRepair: (tabId: string, text: string, metrics?: JsonDocumentMetrics) => void;
  renameTab: (tabId: string, title: string) => void;
  requestWorkerEditJson: (request: EditJsonWorkerRequest) => Promise<string>;
  requestWorkerEditJsonResult: (request: EditJsonWorkerRequest) => Promise<WorkerMessage>;
  resetSearchState: () => void;
  resetTabArtifacts: (tabId: string) => void;
  setEditJsonBusyLabel: (label: string | null) => void;
  setLargeFileLocateEnabled: (tabId: string, enabled: boolean) => void;
  setLargeRawViewerData: (tabId: string, data: LargeRawViewerData | null) => void;
  setLargeViewerData: (tabId: string, data: LargeJsonViewerData | null) => void;
  setLargeViewerStatus: (tabId: string, status: 'idle' | 'building' | 'ready') => void;
  setProcessingStage: (tabId: string, stage: 'idle') => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
  setTabError: (tabId: string, error: string | null) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean, byteLength?: number) => void;
  updateFormattedContent: (
    tabId: string,
    content: string,
    syncModel?: boolean,
    byteLength?: number,
    rawByteLength?: number
  ) => void;
}

export function useJsonToolContentActions({
  activeTab,
  activeDocumentMeta,
  currentErrorLocation,
  beginPerformanceSession,
  clearPerformanceState,
  clearTabStructure,
  getTabContent,
  getFormattedContent,
  leftEditorRef,
  leftSearchWorkerRevisionRef,
  largeModeRef,
  openDocumentEditSession,
  queueFormat,
  queueFormatFromWorkerCache,
  queueRepair,
  renameTab,
  requestWorkerEditJson,
  requestWorkerEditJsonResult,
  resetSearchState,
  resetTabArtifacts,
  setEditJsonBusyLabel,
  setLargeFileLocateEnabled,
  setLargeRawViewerData,
  setLargeViewerData,
  setLargeViewerStatus,
  setProcessingStage,
  setStructureStatus,
  setTabError,
  setTabLargeMode,
  updateTabContent,
  updateFormattedContent,
}: UseJsonToolContentActionsArgs) {
  const measureActiveRawDocument = (text: string) =>
    activeDocumentMeta.rawLength > 0
      ? measureJsonDocumentWithKnownByteLength(text, activeDocumentMeta.rawLength)
      : measureJsonDocument(text);

  const handleFormat = () => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    const metrics = measureActiveRawDocument(currentText);
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

    const metrics = measureActiveRawDocument(currentText);
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
    const currentFormatted = hasSelection ? '' : getFormattedContent(currentTabId);
    const hasFreshFormattedContainer =
      !hasSelection &&
      activeDocumentMeta.formattedRawRevision === activeDocumentMeta.rawRevision &&
      isFormattedJsonContainer(currentFormatted);

    if (!sourceText.trim()) {
      setTabError(currentTabId, `没有可${label}的内容`);
      return;
    }

    setEditJsonBusyLabel(`正在${label}...`);
    try {
      const transformResult = hasSelection
        ? null
        : await requestWorkerEditJsonResult({
            tabId: currentTabId,
            operation,
            rawRevision: activeDocumentMeta.rawRevision,
            reuseText: true,
            text: sourceText,
            textByteLength: activeDocumentMeta.rawLength,
          });
      const transformed = hasSelection
        ? await requestWorkerEditJson({ tabId: currentTabId, operation, text: sourceText })
        : transformResult?.data;
      if (typeof transformed !== 'string') {
        throw new Error('JSON worker returned an empty result');
      }
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

      const metrics = transformResult?.rawMetrics ?? measureJsonDocument(transformed);
      setTabLargeMode(currentTabId, shouldUseLargeModeForMetrics(metrics));
      updateTabContent(currentTabId, transformed, true, metrics.textByteLength);
      if (metrics.textByteLength >= LARGE_FILE_THRESHOLD) {
        setLargeRawViewerData(
          currentTabId,
          transformResult?.rawViewerData ??
            (operation === 'escape-json' ? buildEscapedStringLiteralRawViewerData(transformed.length) : null)
        );
      }
      resetSearchState();
      // Formatting a container and formatting its first escaped string resolve to
      // the same canonical JSON. Reuse is safe only across that single boundary;
      // deeper escape layers are distinct JSON string values and must update the
      // right pane to match the transformed source.
      const canReuseFormattedArtifacts =
        hasFreshFormattedContainer && (isFormattedJsonContainer(sourceText) || isFormattedJsonContainer(transformed));
      if (canReuseFormattedArtifacts) {
        updateFormattedContent(
          currentTabId,
          currentFormatted,
          false,
          activeDocumentMeta.formattedLength,
          metrics.textByteLength
        );
        return;
      }
      if (transformResult?.formattedMatchesRaw) {
        const viewerData = transformResult.viewerData ?? null;
        setLargeViewerData(currentTabId, viewerData);
        setLargeViewerStatus(currentTabId, viewerData ? 'ready' : 'idle');
        setProcessingStage(currentTabId, 'idle');
        setStructureStatus(currentTabId, 'disabled');
        updateFormattedContent(
          currentTabId,
          transformed,
          !viewerData,
          transformResult.formattedMetrics?.textByteLength ?? metrics.textByteLength,
          metrics.textByteLength
        );
        return;
      }
      queueFormatFromWorkerCache(currentTabId, transformed, metrics);
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
    const raw = getTabContent(activeTab.id);
    try {
      if (currentErrorLocation?.rawRevision === activeDocumentMeta.rawRevision) {
        openDocumentEditSession(raw, currentErrorLocation);
        return;
      }
      const cachedFormatted = getFormattedContent(activeTab.id);
      if (cachedFormatted && activeDocumentMeta.formattedRawRevision === activeDocumentMeta.rawRevision) {
        openDocumentEditSession(cachedFormatted);
        return;
      }
      const formatted = await requestWorkerEditJson({ tabId: activeTab.id, operation: 'format', text: raw });
      openDocumentEditSession(formatted);
    } catch (error) {
      if (error instanceof JsonValidationError) {
        openDocumentEditSession(raw, error.location);
        return;
      }
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
    const metrics = measureActiveRawDocument(currentText);
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
