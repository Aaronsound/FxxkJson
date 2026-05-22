import type { MutableRefObject } from 'react';
import type {
  EditJsonWorkerOperation,
  JsonEditPath,
  JsonSearchOptions,
  LargeJsonSearchMatch,
  LocateFeedback,
  RightNodeSelection,
  SearchTarget,
  StructureStatus,
  WorkerMessage,
  WorkerRequestMessage,
} from '../types/jsonTool';

type WorkerRef = MutableRefObject<Worker | null>;
type WorkerRecordRef<T> = MutableRefObject<Record<string, T>>;

export interface JsonWorkerInteractiveCallbacks {
  revealLeftRange: (startOffset: number, endOffset: number) => void;
  setLargeViewerSearchResults: (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore?: boolean,
    nextStartOffset?: number,
    append?: boolean
  ) => void;
  setLeftSearchResults: (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore?: boolean,
    nextStartOffset?: number,
    append?: boolean
  ) => void;
  setLocateFeedback: (tabId: string, feedback: LocateFeedback | null) => void;
  setProcessingStage: (tabId: string, stage: 'idle') => void;
  setRightNodeSelection: (tabId: string, selection: RightNodeSelection | null) => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
}

interface JsonWorkerInteractiveFlowArgs {
  activeTabIdRef: MutableRefObject<string>;
  formattedTextByTabRef: WorkerRecordRef<string>;
  getCallbacks: () => JsonWorkerInteractiveCallbacks;
  postWorkerRequest: (message: WorkerRequestMessage, transfer?: Transferable[]) => void;
  structureStatusRef: WorkerRecordRef<StructureStatus>;
  workerRef: WorkerRef;
  workerStructureEnabledRef: WorkerRecordRef<boolean>;
}

function getSearchRequestKey(target: SearchTarget, tabId: string) {
  return `${target}:${tabId}`;
}

export function createJsonWorkerInteractiveFlow({
  activeTabIdRef,
  formattedTextByTabRef,
  getCallbacks,
  postWorkerRequest,
  structureStatusRef,
  workerRef,
  workerStructureEnabledRef,
}: JsonWorkerInteractiveFlowArgs) {
  let locateRequestCounter = 0;
  let searchRequestCounter = 0;
  const latestLocateRequests: Record<string, number> = {};
  const latestSearchRequests: Record<string, number> = {};
  const pendingValueRequests: Record<number, (value: string | null) => void> = {};
  const pendingEditJsonRequests: Record<
    number,
    {
      reject: (error: Error) => void;
      resolve: (value: WorkerMessage) => void;
    }
  > = {};

  const cancelRequests = (tabId: string) => {
    delete latestLocateRequests[tabId];
    delete latestSearchRequests[getSearchRequestKey('left', tabId)];
    delete latestSearchRequests[getSearchRequestKey('right', tabId)];
  };

  const requestLocate = (tabId: string, offset: number) => {
    const callbacks = getCallbacks();
    if (!workerRef.current) {
      callbacks.setLocateFeedback(tabId, {
        status: 'failed',
        message: structureStatusRef.current[tabId] === 'building' ? '定位索引中' : '当前位置无法映射',
        updatedAt: Date.now(),
      });
      callbacks.setRightNodeSelection(tabId, null);
      return;
    }

    const requestId = ++locateRequestCounter;
    latestLocateRequests[tabId] = requestId;
    const canUseFullLocate = workerStructureEnabledRef.current[tabId] && structureStatusRef.current[tabId] === 'ready';

    callbacks.setLocateFeedback(tabId, {
      status: 'pending',
      message: `正在定位 offset ${Math.max(0, Math.floor(offset)).toLocaleString()}`,
      updatedAt: Date.now(),
    });
    callbacks.setRightNodeSelection(tabId, null);
    postWorkerRequest({
      type: canUseFullLocate ? 'locate' : 'locate-right-direct',
      requestId,
      tabId,
      offset,
    });
  };

  const requestSearch = (
    tabId: string,
    query: string,
    searchOptions: JsonSearchOptions,
    startOffset = 0,
    append = false,
    target: SearchTarget = 'right',
    text?: string,
    rawRevision?: number
  ) => {
    const callbacks = getCallbacks();
    if (!workerRef.current) {
      if (target === 'left') {
        callbacks.setLeftSearchResults(tabId, []);
      } else {
        callbacks.setLargeViewerSearchResults(tabId, []);
      }
      return;
    }

    const requestId = ++searchRequestCounter;
    latestSearchRequests[getSearchRequestKey(target, tabId)] = requestId;
    postWorkerRequest({
      type: 'search',
      requestId,
      tabId,
      target,
      query,
      searchOptions,
      startOffset,
      append,
      text,
      rawRevision,
    });
  };

  const requestValue = (tabId: string, offset: number, preferCachedText = false) =>
    new Promise<string | null>((resolve) => {
      if (!workerRef.current) {
        resolve(null);
        return;
      }

      const requestId = ++locateRequestCounter;
      pendingValueRequests[requestId] = resolve;

      if (workerStructureEnabledRef.current[tabId] && structureStatusRef.current[tabId] === 'ready') {
        postWorkerRequest({
          type: 'read-value',
          requestId,
          tabId,
          offset,
        });
        return;
      }

      if (preferCachedText) {
        postWorkerRequest({
          type: 'read-value-direct',
          requestId,
          tabId,
          offset,
        });
        return;
      }

      const formattedText = formattedTextByTabRef.current[tabId] ?? '';
      if (!formattedText) {
        delete pendingValueRequests[requestId];
        resolve(null);
        return;
      }

      postWorkerRequest({
        type: 'read-value-direct',
        requestId,
        tabId,
        offset,
        text: formattedText,
      });
    });

  const requestEditJsonResult = (
    tabId: string,
    operation: EditJsonWorkerOperation,
    text: string,
    originalText?: string,
    path?: JsonEditPath,
    offset?: number,
    searchTerm?: string,
    searchOptions?: JsonSearchOptions,
    replacement?: string
  ) =>
    new Promise<WorkerMessage>((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('JSON worker is not ready'));
        return;
      }

      const requestId = ++locateRequestCounter;
      pendingEditJsonRequests[requestId] = { reject, resolve };
      postWorkerRequest({
        type: 'edit-json',
        requestId,
        tabId,
        operation,
        text,
        originalText,
        path,
        offset,
        searchTerm,
        searchOptions,
        replacement,
      });
    });

  const requestEditJson = (
    tabId: string,
    operation: EditJsonWorkerOperation,
    text: string,
    originalText?: string,
    path?: JsonEditPath,
    offset?: number,
    searchTerm?: string,
    searchOptions?: JsonSearchOptions,
    replacement?: string
  ) =>
    requestEditJsonResult(
      tabId,
      operation,
      text,
      originalText,
      path,
      offset,
      searchTerm,
      searchOptions,
      replacement
    ).then((message) => {
      if (typeof message.data !== 'string') {
        throw new Error('JSON worker returned an empty result');
      }

      return message.data;
    });

  const applySearchResult = (message: WorkerMessage) => {
    const target = message.target ?? 'right';
    const requestKey = getSearchRequestKey(target, message.tabId);
    if (message.tabId !== activeTabIdRef.current || latestSearchRequests[requestKey] !== message.requestId) {
      return;
    }

    const callbacks = getCallbacks();
    const applyResults = target === 'left' ? callbacks.setLeftSearchResults : callbacks.setLargeViewerSearchResults;
    applyResults(
      message.tabId,
      message.matches ?? [],
      Boolean(message.hasMore),
      message.nextStartOffset ?? 0,
      Boolean(message.append)
    );
  };

  const applyLocateResult = (message: WorkerMessage) => {
    if (message.tabId !== activeTabIdRef.current || latestLocateRequests[message.tabId] !== message.requestId) {
      return;
    }

    const callbacks = getCallbacks();
    if (workerStructureEnabledRef.current[message.tabId]) {
      callbacks.setStructureStatus(message.tabId, 'ready');
    }
    callbacks.setProcessingStage(message.tabId, 'idle');

    const rightStartOffset = message.rightStartOffset;
    const rightEndOffset = message.rightEndOffset;
    const hasRightRange = typeof rightStartOffset === 'number' && typeof rightEndOffset === 'number';

    if (message.rightOnly && message.found && hasRightRange) {
      callbacks.setLocateFeedback(message.tabId, {
        status: 'success',
        message: `已选中右侧节点 offset ${rightStartOffset.toLocaleString()}`,
        updatedAt: Date.now(),
      });
      callbacks.setRightNodeSelection(message.tabId, {
        path: message.path ?? null,
        pathText: message.pathText ?? null,
        startOffset: rightStartOffset,
        endOffset: rightEndOffset,
        updatedAt: Date.now(),
      });
      return;
    }

    if (message.found && typeof message.startOffset === 'number' && typeof message.endOffset === 'number') {
      callbacks.setLocateFeedback(message.tabId, {
        status: 'success',
        message: `已定位到 offset ${message.startOffset.toLocaleString()}`,
        startOffset: message.startOffset,
        endOffset: message.endOffset,
        updatedAt: Date.now(),
      });
      callbacks.setRightNodeSelection(
        message.tabId,
        hasRightRange
          ? {
              path: message.path ?? null,
              pathText: message.pathText ?? null,
              startOffset: rightStartOffset,
              endOffset: rightEndOffset,
              updatedAt: Date.now(),
            }
          : null
      );
      callbacks.revealLeftRange(message.startOffset, message.endOffset);
      return;
    }

    callbacks.setLocateFeedback(message.tabId, {
      status: 'failed',
      message: '该位置无法映射',
      updatedAt: Date.now(),
    });
    callbacks.setRightNodeSelection(message.tabId, null);
  };

  const handleResult = (message: WorkerMessage) => {
    if (message.type === 'search-result') {
      applySearchResult(message);
      return true;
    }

    if (message.type === 'locate-result') {
      applyLocateResult(message);
      return true;
    }

    if (message.type === 'value-result') {
      const resolve = pendingValueRequests[message.requestId];
      if (resolve) {
        delete pendingValueRequests[message.requestId];
        resolve(message.found ? (message.value ?? null) : null);
      }
      return true;
    }

    if (message.type === 'edit-json-result') {
      const pending = pendingEditJsonRequests[message.requestId];
      if (pending) {
        delete pendingEditJsonRequests[message.requestId];
        if (message.success && typeof message.data === 'string') {
          pending.resolve(message);
        } else {
          pending.reject(new Error(message.error ?? 'JSON 处理失败'));
        }
      }
      return true;
    }

    return false;
  };

  const stop = () => {
    Object.keys(pendingValueRequests).forEach((requestId) => {
      pendingValueRequests[Number(requestId)]?.(null);
      delete pendingValueRequests[Number(requestId)];
    });
    Object.keys(pendingEditJsonRequests).forEach((requestId) => {
      pendingEditJsonRequests[Number(requestId)]?.reject(new Error('JSON worker stopped'));
      delete pendingEditJsonRequests[Number(requestId)];
    });
  };

  return {
    cancelRequests,
    handleResult,
    requestEditJson,
    requestEditJsonResult,
    requestLocate,
    requestSearch,
    requestValue,
    stop,
  };
}
