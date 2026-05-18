import { useCallback } from 'react';
import type { JsonEditPath } from '../types/jsonTool';
import { formatJsonPath } from '../utils/jsonPath';
import { writeTextToClipboard } from '../utils/clipboard';

type CopyNodeDetailMode = 'path' | 'key' | 'compact-json' | 'formatted-json';
type RightNodeMutationOperation = 'delete-node' | 'rename-node-key';

interface EditableNodePayload {
  path: JsonEditPath;
  value: string;
}

interface UseRightNodeActionsArgs {
  applyRawUpdate: (tabId: string, updated: string) => void;
  getTabContent: (tabId: string) => string;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
  queueFormatAfterEditSave: (tabId: string, text: string) => void;
  readEditableNodeAtOffset: (
    tabId: string,
    offset: number,
    preferCachedText: boolean,
    invalidMessage: string
  ) => Promise<EditableNodePayload>;
  requestWorkerEditJson: (
    tabId: string,
    operation: RightNodeMutationOperation,
    text: string,
    originalText?: string,
    path?: JsonEditPath
  ) => Promise<string>;
  requestWorkerValue: (
    tabId: string,
    offset: number,
    preferCachedText?: boolean
  ) => Promise<string | null>;
  resetSearchState: () => void;
  setEditJsonBusyLabel: (label: string | null) => void;
  setTabError: (tabId: string, error: string | null) => void;
}

const copyLabels: Record<CopyNodeDetailMode, string> = {
  path: 'JSON Path',
  key: 'key',
  'compact-json': '压缩 JSON',
  'formatted-json': '格式化 JSON',
};

export function useRightNodeActions({
  applyRawUpdate,
  getTabContent,
  logEvent,
  queueFormatAfterEditSave,
  readEditableNodeAtOffset,
  requestWorkerEditJson,
  requestWorkerValue,
  resetSearchState,
  setEditJsonBusyLabel,
  setTabError,
}: UseRightNodeActionsArgs) {
  const copyValueAtOffset = useCallback(async (
    tabId: string,
    offset: number,
    preferCachedText = false
  ) => {
    const valueToCopy = await requestWorkerValue(tabId, offset, preferCachedText);
    if (valueToCopy === null) {
      setTabError(tabId, '未找到可复制的 JSON 值');
      logEvent('copy-value-missed', {
        tabId,
        offset,
        preferCachedText,
      });
      return;
    }

    try {
      await writeTextToClipboard(valueToCopy);
      setTabError(tabId, null);
      logEvent('copy-value-success', {
        tabId,
        offset,
        copiedLength: valueToCopy.length,
        preferCachedText,
        viaDesktopClipboard: Boolean(window.electronAPI?.writeClipboardText),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTabError(tabId, `复制值失败：${message}`);
      logEvent('copy-value-failed', {
        tabId,
        offset,
        preferCachedText,
        error: message,
      });
    }
  }, [logEvent, requestWorkerValue, setTabError]);

  const copyNodeDetailAtOffset = useCallback(async (
    tabId: string,
    offset: number,
    preferCachedText: boolean,
    mode: CopyNodeDetailMode
  ) => {
    try {
      const parsed = await readEditableNodeAtOffset(
        tabId,
        offset,
        preferCachedText,
        `当前节点无法复制${copyLabels[mode]}`
      );
      const textToCopy = (() => {
        if (mode === 'path') {
          return formatJsonPath(parsed.path);
        }

        if (mode === 'key') {
          const key = parsed.path[parsed.path.length - 1];
          if (key === undefined) {
            throw new Error('根节点没有 key');
          }
          return String(key);
        }

        const value = JSON.parse(parsed.value);
        return mode === 'compact-json'
          ? JSON.stringify(value)
          : JSON.stringify(value, null, 2);
      })();

      await writeTextToClipboard(textToCopy);
      setTabError(tabId, null);
      logEvent('copy-node-detail-success', {
        tabId,
        offset,
        mode,
        copiedLength: textToCopy.length,
        preferCachedText,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTabError(tabId, `复制${copyLabels[mode]}失败：${message}`);
      logEvent('copy-node-detail-failed', {
        tabId,
        offset,
        mode,
        preferCachedText,
        error: message,
      });
    }
  }, [logEvent, readEditableNodeAtOffset, setTabError]);

  const applyRightNodeMutationAtOffset = useCallback(async (
    tabId: string,
    offset: number,
    preferCachedText: boolean,
    operation: RightNodeMutationOperation
  ) => {
    const isDelete = operation === 'delete-node';
    setEditJsonBusyLabel(isDelete ? '正在删除当前节点...' : '正在重命名当前 key...');
    try {
      const parsed = await readEditableNodeAtOffset(
        tabId,
        offset,
        preferCachedText,
        isDelete ? '当前节点无法删除' : '当前 key 无法重命名'
      );

      if (parsed.path.length === 0) {
        throw new Error(isDelete ? '不能删除根节点' : '根节点没有 key');
      }

      let workerText = '';
      if (isDelete) {
        const confirmed = window.confirm('确定删除当前节点吗？');
        if (!confirmed) {
          return;
        }
      } else {
        const currentKey = parsed.path[parsed.path.length - 1];
        if (typeof currentKey !== 'string') {
          throw new Error('只有对象 key 可以重命名');
        }

        const nextKey = window.prompt('输入新的 key 名称', currentKey);
        if (nextKey === null) {
          return;
        }
        workerText = nextKey;
      }

      const original = getTabContent(tabId);
      const updated = await requestWorkerEditJson(
        tabId,
        operation,
        workerText,
        original,
        parsed.path
      );

      applyRawUpdate(tabId, updated);
      resetSearchState();
      queueFormatAfterEditSave(tabId, updated);
      setTabError(tabId, null);
      logEvent('right-node-mutation-success', {
        tabId,
        offset,
        operation,
        path: parsed.path,
        rawLength: updated.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTabError(
        tabId,
        isDelete ? `删除当前节点失败：${message}` : `重命名 key 失败：${message}`
      );
      logEvent('right-node-mutation-failed', {
        tabId,
        offset,
        operation,
        preferCachedText,
        error: message,
      });
    } finally {
      setEditJsonBusyLabel(null);
    }
  }, [
    applyRawUpdate,
    getTabContent,
    logEvent,
    queueFormatAfterEditSave,
    readEditableNodeAtOffset,
    requestWorkerEditJson,
    resetSearchState,
    setEditJsonBusyLabel,
    setTabError,
  ]);

  return {
    applyRightNodeMutationAtOffset,
    copyNodeDetailAtOffset,
    copyValueAtOffset,
  };
}
