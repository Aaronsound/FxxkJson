import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { EditJsonWorkerRequest, JsonEditPath } from '../types/jsonTool';
import { getJsonLiteralDetails, parseEditableNodePayload } from '../utils/jsonEditNodePayload';

type RequestWorkerEditJson = (
  request: EditJsonWorkerRequest & { operation: 'read-node' | 'unescape-json' }
) => Promise<string>;

interface UseRightNodeEditOpenersArgs {
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  openNodeEditSession: (initialValue: string, path: JsonEditPath) => void;
  requestWorkerEditJson: RequestWorkerEditJson;
  setEditJsonBusyLabel: (label: string | null) => void;
  setTabError: (tabId: string, message: string | null) => void;
}

export function useRightNodeEditOpeners({
  formattedTextByTabRef,
  openNodeEditSession,
  requestWorkerEditJson,
  setEditJsonBusyLabel,
  setTabError,
}: UseRightNodeEditOpenersArgs) {
  const readEditableNodeAtOffset = useCallback(
    async (tabId: string, offset: number, preferCachedText: boolean, invalidMessage: string) => {
      const readAndParse = async (sourceText: string) => {
        const payload = await requestWorkerEditJson({
          tabId,
          operation: 'read-node',
          text: sourceText,
          offset,
        });
        return parseEditableNodePayload(payload, invalidMessage);
      };

      if (preferCachedText) {
        try {
          return await readAndParse('');
        } catch (error) {
          const fallbackText = formattedTextByTabRef.current[tabId] ?? '';
          if (!fallbackText) {
            throw error;
          }
        }
      }

      return readAndParse(formattedTextByTabRef.current[tabId] ?? '');
    },
    [formattedTextByTabRef, requestWorkerEditJson]
  );

  const handleOpenEditNodeAtOffset = async (tabId: string, offset: number, preferCachedText = false) => {
    setEditJsonBusyLabel('正在准备当前节点...');
    try {
      const parsed = await readEditableNodeAtOffset(tabId, offset, preferCachedText, '当前节点无法编辑');
      openNodeEditSession(parsed.value, parsed.path);
    } catch (error) {
      setTabError(tabId, error instanceof Error ? `打开当前节点编辑失败：${error.message}` : '打开当前节点编辑失败');
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleOpenUnescapedNodeAtOffset = async (tabId: string, offset: number, preferCachedText = false) => {
    setEditJsonBusyLabel('正在反转义当前节点...');
    try {
      const parsed = await readEditableNodeAtOffset(tabId, offset, preferCachedText, '当前节点无法反转义');
      if (getJsonLiteralDetails(parsed.value).kind !== 'string') {
        throw new Error('当前节点不是字符串值');
      }

      const transformed = await requestWorkerEditJson({ tabId, operation: 'unescape-json', text: parsed.value });
      JSON.parse(transformed);
      openNodeEditSession(transformed, parsed.path);
    } catch (error) {
      setTabError(tabId, error instanceof Error ? `反转义当前节点失败：${error.message}` : '反转义当前节点失败');
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  return {
    handleOpenEditNodeAtOffset,
    handleOpenUnescapedNodeAtOffset,
    readEditableNodeAtOffset,
  };
}
