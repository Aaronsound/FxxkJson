import type { MutableRefObject } from 'react';
import type {
  EditJsonWorkerOperation,
  EditJsonWorkerRequest,
  LargeJsonViewerData,
  LargeRawViewerData,
  ProcessingStage,
  StructureStatus,
  Tab,
  WorkerMessage,
} from '../types/jsonTool';
import { writeTextToClipboard } from '../utils/clipboard';
import { getUtf8ByteLength, isLargeDocument } from '../utils/jsonDocumentMetrics';
import type { EditJsonSession } from './useJsonEditSession';
import type { PerformanceSession } from './useJsonPerformanceTracking';

type EditJsonTransformOperation = Extract<EditJsonWorkerOperation, 'escape-json' | 'unescape-json'>;

interface UseJsonEditActionsArgs {
  activeTab: Tab | null | undefined;
  beginPerformanceSession: (
    tabId: string,
    trigger: 'edit-save',
    label: string,
    fileSize: number | null,
    rawBytes: number,
    largeMode: boolean
  ) => void;
  closeEditJson: () => void;
  editJsonSession: EditJsonSession | null;
  editJsonValueRef: MutableRefObject<string>;
  getTabContent: (tabId: string) => string;
  mutatePerformanceSession: (tabId: string, mutate: (session: PerformanceSession) => void, shouldLog?: boolean) => void;
  queueFormatAfterEditSave: (tabId: string, text: string) => void;
  requestWorkerEditJson: (request: EditJsonWorkerRequest) => Promise<string>;
  requestWorkerEditJsonResult: (request: EditJsonWorkerRequest) => Promise<WorkerMessage>;
  resetSearchState: () => void;
  setEditJsonBusyLabel: (label: string | null) => void;
  setEditJsonError: (error: string | null) => void;
  setLargeRawViewerData: (tabId: string, data: LargeRawViewerData | null) => void;
  setLargeViewerData: (tabId: string, data: LargeJsonViewerData | null) => void;
  setLargeViewerStatus: (tabId: string, status: 'idle' | 'building' | 'ready') => void;
  setProcessingStage: (tabId: string, stage: ProcessingStage) => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
  setTabFormatting: (tabId: string, formatting: boolean) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  showCopyLiteralNotice: () => void;
  updateFormattedContent: (tabId: string, content: string, syncModel?: boolean) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean) => void;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
}

export function useJsonEditActions({
  activeTab,
  beginPerformanceSession,
  closeEditJson,
  editJsonSession,
  editJsonValueRef,
  getTabContent,
  mutatePerformanceSession,
  queueFormatAfterEditSave,
  requestWorkerEditJson,
  requestWorkerEditJsonResult,
  resetSearchState,
  setEditJsonBusyLabel,
  setEditJsonError,
  setLargeRawViewerData,
  setLargeViewerData,
  setLargeViewerStatus,
  setProcessingStage,
  setStructureStatus,
  setTabFormatting,
  setTabLargeMode,
  showCopyLiteralNotice,
  updateFormattedContent,
  updateTabContent,
  workerStructureEnabledRef,
}: UseJsonEditActionsArgs) {
  const applyNodeSaveArtifacts = (tabId: string, saveResult: WorkerMessage, largeMode: boolean) => {
    if (typeof saveResult.formattedText !== 'string') {
      return false;
    }

    const rightModelStartedAt = performance.now();
    updateFormattedContent(tabId, saveResult.formattedText, true);
    const rightModelCompletedAt = performance.now();
    setLargeRawViewerData(tabId, saveResult.rawViewerData ?? null);
    setLargeViewerData(tabId, saveResult.viewerData ?? null);
    setLargeViewerStatus(tabId, saveResult.viewerData ? 'ready' : 'idle');
    setStructureStatus(
      tabId,
      saveResult.structureWarming
        ? 'building'
        : workerStructureEnabledRef.current[tabId]
          ? 'ready'
          : largeMode
            ? 'disabled'
            : 'ready'
    );
    setProcessingStage(tabId, saveResult.structureWarming ? 'building-index' : 'idle');
    setTabFormatting(tabId, false);
    mutatePerformanceSession(
      tabId,
      (session) => {
        session.pendingFormat = false;
        session.requestId = null;
        session.formatQueuedAt = rightModelStartedAt;
        session.formatStartedAt = rightModelStartedAt;
        session.formatCompletedAt = rightModelStartedAt;
        session.rightModelStartedAt = rightModelStartedAt;
        session.rightModelCompletedAt = rightModelCompletedAt;
        session.formattedBytes = getUtf8ByteLength(saveResult.formattedText ?? '');
        session.viewerIndexMs = typeof saveResult.viewerIndexMs === 'number' ? saveResult.viewerIndexMs : null;
        session.viewerReadyAt = rightModelCompletedAt;
        session.structureCompletedAt = rightModelCompletedAt;
        session.structureEnabled = Boolean(workerStructureEnabledRef.current[tabId]);
        session.status = 'ready';
        session.error = null;
      },
      true
    );
    return true;
  };

  const handleSaveEditJson = async () => {
    if (!activeTab) {
      return;
    }

    const currentTabId = activeTab.id;
    const currentTabTitle = activeTab.title;
    const isNodeEdit = editJsonSession?.mode === 'node';
    setEditJsonBusyLabel(isNodeEdit ? '正在更新当前节点...' : '正在更新原始 JSON...');
    try {
      const original = getTabContent(currentTabId);
      const saveResult = await requestWorkerEditJsonResult({
        tabId: currentTabId,
        operation: isNodeEdit ? 'save-node' : 'save',
        text: editJsonValueRef.current,
        originalText: original,
        path: editJsonSession?.path,
      });
      const updated = saveResult.data;
      if (typeof updated !== 'string') {
        throw new Error('JSON worker returned an empty result');
      }

      const largeMode = isLargeDocument(updated);
      beginPerformanceSession(currentTabId, 'edit-save', currentTabTitle, null, getUtf8ByteLength(updated), largeMode);

      mutatePerformanceSession(currentTabId, (session) => {
        session.leftModelStartedAt = performance.now();
      });
      updateTabContent(currentTabId, updated, true);
      mutatePerformanceSession(currentTabId, (session) => {
        session.leftModelCompletedAt = performance.now();
      });
      setTabLargeMode(currentTabId, largeMode);
      setEditJsonError(null);
      closeEditJson();
      resetSearchState();

      if (!isNodeEdit || !applyNodeSaveArtifacts(currentTabId, saveResult, largeMode)) {
        queueFormatAfterEditSave(currentTabId, updated);
      }
    } catch (error) {
      setEditJsonError(error instanceof Error ? `保存 JSON 失败：${error.message}` : '保存 JSON 失败');
      setEditJsonBusyLabel(null);
    }
  };

  const handleTransformEditJsonContent = async (
    operation: EditJsonTransformOperation,
    label: string,
    value: string
  ) => {
    if (!activeTab) {
      throw new Error('当前没有可编辑的 JSON');
    }

    if (!value.trim()) {
      const errorMessage = `没有可${label}的编辑内容`;
      setEditJsonError(errorMessage);
      throw new Error(errorMessage);
    }

    setEditJsonBusyLabel(`正在${label}编辑内容...`);
    try {
      const transformed = await requestWorkerEditJson({ tabId: activeTab.id, operation, text: value });
      editJsonValueRef.current = transformed;
      setEditJsonError(null);
      return transformed;
    } catch (error) {
      setEditJsonError(error instanceof Error ? `${label}编辑内容失败：${error.message}` : `${label}编辑内容失败`);
      throw error;
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleUnescapeEditJsonContent = (value: string) =>
    handleTransformEditJsonContent('unescape-json', '反转义', value);

  const handleEscapeEditJsonContent = (value: string) => handleTransformEditJsonContent('escape-json', '转义', value);

  const handleCopyEscapedJson = async () => {
    if (!activeTab) {
      return;
    }

    setEditJsonBusyLabel('正在复制字符串字面量...');
    try {
      const literal = await requestWorkerEditJson({
        tabId: activeTab.id,
        operation: 'copy-literal',
        text: editJsonValueRef.current,
      });
      await writeTextToClipboard(literal);
      setEditJsonError(null);
      showCopyLiteralNotice();
    } catch (error) {
      setEditJsonError(error instanceof Error ? `复制字符串字面量失败：${error.message}` : '复制字符串字面量失败');
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  return {
    handleCopyEscapedJson,
    handleEscapeEditJsonContent,
    handleSaveEditJson,
    handleUnescapeEditJsonContent,
  };
}
