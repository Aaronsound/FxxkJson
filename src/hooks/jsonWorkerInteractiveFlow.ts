import type { MutableRefObject } from 'react';
import type {
  EditJsonWorkerRequest,
  LargeJsonSearchMatch,
  LocateFeedback,
  RightNodeSelection,
  SearchTarget,
  StructureStatus,
  WorkerMessage,
  WorkerRequestMessage,
  WorkerRequestTextPayload,
  WorkerSearchRequest,
} from '../types/jsonTool';
import { unpackSearchMatches } from '../utils/searchMatchPayload';

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
  createWorkerTextPayload: (
    text: string,
    byteLength?: number
  ) => { message: WorkerRequestTextPayload; transfer: Transferable[] };
  getCallbacks: () => JsonWorkerInteractiveCallbacks;
  postWorkerRequest: (message: WorkerRequestMessage, transfer?: Transferable[]) => void;
  readWorkerTextField: (
    message: WorkerMessage,
    stringKey: 'data' | 'formattedText',
    bufferKey: 'dataBuffer' | 'formattedTextBuffer'
  ) => string | null;
  structureStatusRef: WorkerRecordRef<StructureStatus>;
  workerRef: WorkerRef;
  workerStructureEnabledRef: WorkerRecordRef<boolean>;
}

function getSearchRequestKey(target: SearchTarget, tabId: string) {
  return `${target}:${tabId}`;
}

interface PendingEditJsonRequest {
  reject: (error: Error) => void;
  request: EditJsonWorkerRequest;
  retriedWithOriginalText: boolean;
  retriedWithText: boolean;
  resolve: (value: WorkerMessage) => void;
}

export function createJsonWorkerInteractiveFlow({
  activeTabIdRef,
  createWorkerTextPayload,
  getCallbacks,
  postWorkerRequest,
  readWorkerTextField,
  structureStatusRef,
  workerRef,
  workerStructureEnabledRef,
}: JsonWorkerInteractiveFlowArgs) {
  let locateRequestCounter = 0;
  let searchRequestCounter = 0;
  const latestLocateRequests: Record<string, number> = {};
  const latestSearchRequests: Record<string, number> = {};
  const latestLocateInputs: Record<string, { offset: number; tabId: string }> = {};
  const latestSearchInputs: Record<string, WorkerSearchRequest> = {};
  const pendingEditJsonRequests: Record<number, PendingEditJsonRequest> = {};
  const suspendedEditJsonRequests: PendingEditJsonRequest[] = [];

  const cancelRequests = (tabId: string) => {
    delete latestLocateRequests[tabId];
    delete latestLocateInputs[tabId];
    delete latestSearchRequests[getSearchRequestKey('left', tabId)];
    delete latestSearchRequests[getSearchRequestKey('right', tabId)];
    delete latestSearchInputs[getSearchRequestKey('left', tabId)];
    delete latestSearchInputs[getSearchRequestKey('right', tabId)];

    for (const requestId of Object.keys(pendingEditJsonRequests)) {
      const pending = pendingEditJsonRequests[Number(requestId)];
      if (pending?.request.tabId === tabId) {
        pending.reject(new Error('JSON worker request cancelled'));
        delete pendingEditJsonRequests[Number(requestId)];
      }
    }
    for (let index = suspendedEditJsonRequests.length - 1; index >= 0; index -= 1) {
      if (suspendedEditJsonRequests[index]?.request.tabId === tabId) {
        suspendedEditJsonRequests[index]?.reject(new Error('JSON worker request cancelled'));
        suspendedEditJsonRequests.splice(index, 1);
      }
    }
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
    latestLocateInputs[tabId] = { tabId, offset };
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

  const requestSearch = (request: WorkerSearchRequest) => {
    const {
      tabId,
      query,
      searchOptions,
      startOffset = 0,
      append = false,
      target = 'right',
      text,
      textByteLength,
      rawRevision,
    } = request;
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
    const requestKey = getSearchRequestKey(target, tabId);
    latestSearchRequests[requestKey] = requestId;
    latestSearchInputs[requestKey] = { ...request, target, startOffset, append };
    const textPayload = typeof text === 'string' ? createWorkerTextPayload(text, textByteLength) : null;
    postWorkerRequest(
      {
        type: 'search',
        requestId,
        tabId,
        target,
        query,
        searchOptions,
        startOffset,
        append,
        ...textPayload?.message,
        textByteLength,
        rawRevision,
      },
      textPayload?.transfer
    );
  };

  const sendEditJsonRequest = (
    request: EditJsonWorkerRequest,
    retriedWithOriginalText: boolean,
    retriedWithText: boolean,
    resolve: (value: WorkerMessage) => void,
    reject: (error: Error) => void
  ) => {
    const {
      tabId,
      operation,
      text,
      textByteLength,
      originalText,
      originalTextByteLength,
      rawRevision,
      reuseOriginalText,
      path,
      offset,
      searchTerm,
      searchOptions,
      replacement,
      reuseText,
    } = request;
    if (!workerRef.current) {
      reject(new Error('JSON worker is not ready'));
      return;
    }

    const requestId = ++locateRequestCounter;
    pendingEditJsonRequests[requestId] = { reject, request, resolve, retriedWithOriginalText, retriedWithText };
    const textPayload = !reuseText || retriedWithText ? createWorkerTextPayload(text, textByteLength) : null;
    const shouldIncludeOriginalText = !reuseOriginalText || retriedWithOriginalText;
    const originalTextPayload =
      shouldIncludeOriginalText && typeof originalText === 'string'
        ? createWorkerTextPayload(originalText, originalTextByteLength)
        : null;
    const originalMessage = originalTextPayload
      ? 'textBuffer' in originalTextPayload.message
        ? { originalTextBuffer: originalTextPayload.message.textBuffer }
        : { originalText: originalTextPayload.message.text }
      : {};
    postWorkerRequest(
      {
        type: 'edit-json',
        requestId,
        tabId,
        operation,
        ...textPayload?.message,
        textByteLength,
        ...originalMessage,
        originalTextByteLength,
        rawRevision,
        path,
        offset,
        searchTerm,
        searchOptions,
        replacement,
        reuseText,
      },
      [...(textPayload?.transfer ?? []), ...(originalTextPayload?.transfer ?? [])]
    );
  };

  const requestEditJsonResult = (request: EditJsonWorkerRequest) =>
    new Promise<WorkerMessage>((resolve, reject) => {
      sendEditJsonRequest(request, false, false, resolve, reject);
    });

  const requestEditJson = (request: EditJsonWorkerRequest) =>
    requestEditJsonResult(request).then((message) => {
      if (typeof message.data !== 'string') {
        throw new Error('JSON worker returned an empty result');
      }

      return message.data;
    });

  const applySearchResult = (message: WorkerMessage) => {
    const target = message.target ?? 'right';
    const requestKey = getSearchRequestKey(target, message.tabId);
    if (latestSearchRequests[requestKey] !== message.requestId) {
      return;
    }

    delete latestSearchInputs[requestKey];
    if (message.tabId !== activeTabIdRef.current) {
      return;
    }

    const callbacks = getCallbacks();
    const applyResults = target === 'left' ? callbacks.setLeftSearchResults : callbacks.setLargeViewerSearchResults;
    const matches = unpackSearchMatches(message.matchData) ?? message.matches ?? [];
    applyResults(
      message.tabId,
      matches,
      Boolean(message.hasMore),
      message.nextStartOffset ?? 0,
      Boolean(message.append)
    );
  };

  const applyLocateResult = (message: WorkerMessage) => {
    if (latestLocateRequests[message.tabId] !== message.requestId) {
      return;
    }

    delete latestLocateInputs[message.tabId];
    if (message.tabId !== activeTabIdRef.current) {
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

    if (message.type === 'edit-json-result') {
      const pending = pendingEditJsonRequests[message.requestId];
      if (pending) {
        delete pendingEditJsonRequests[message.requestId];
        const data = readWorkerTextField(message, 'data', 'dataBuffer');
        const formattedText = readWorkerTextField(message, 'formattedText', 'formattedTextBuffer');
        if (
          !message.success &&
          message.requiresOriginalText &&
          !pending.retriedWithOriginalText &&
          typeof pending.request.originalText === 'string'
        ) {
          sendEditJsonRequest(pending.request, true, pending.retriedWithText, pending.resolve, pending.reject);
        } else if (!message.success && message.requiresText && !pending.retriedWithText) {
          sendEditJsonRequest(pending.request, pending.retriedWithOriginalText, true, pending.resolve, pending.reject);
        } else if (message.success && (typeof data === 'string' || message.rawPatch)) {
          pending.resolve({
            ...message,
            data: data ?? message.data,
            formattedText: formattedText ?? message.formattedText,
          });
        } else {
          pending.reject(new Error(message.error ?? 'JSON 处理失败'));
        }
      }
      return true;
    }

    return false;
  };

  const suspendForRestart = () => {
    Object.keys(pendingEditJsonRequests).forEach((requestId) => {
      const pending = pendingEditJsonRequests[Number(requestId)];
      if (pending) {
        suspendedEditJsonRequests.push(pending);
      }
      delete pendingEditJsonRequests[Number(requestId)];
    });
  };

  const resumeEditsAfterRestart = () => {
    const pendingRequests = suspendedEditJsonRequests.splice(0);
    for (const pending of pendingRequests) {
      sendEditJsonRequest(pending.request, true, true, pending.resolve, pending.reject);
    }
  };

  const resumeTabRequests = (tabId: string) => {
    const locateInput = latestLocateInputs[tabId];
    if (locateInput) {
      requestLocate(locateInput.tabId, locateInput.offset);
    }

    for (const target of ['left', 'right'] as const) {
      const searchInput = latestSearchInputs[getSearchRequestKey(target, tabId)];
      if (searchInput) {
        requestSearch(searchInput);
      }
    }
  };

  const stop = () => {
    for (const tabId of new Set([
      ...Object.keys(latestLocateInputs),
      ...Object.values(latestSearchInputs).map((request) => request.tabId),
    ])) {
      cancelRequests(tabId);
    }
    Object.keys(pendingEditJsonRequests).forEach((requestId) => {
      pendingEditJsonRequests[Number(requestId)]?.reject(new Error('JSON worker stopped'));
      delete pendingEditJsonRequests[Number(requestId)];
    });
    for (const pending of suspendedEditJsonRequests.splice(0)) {
      pending.reject(new Error('JSON worker stopped'));
    }
  };

  return {
    cancelRequests,
    handleResult,
    requestEditJson,
    requestEditJsonResult,
    requestLocate,
    requestSearch,
    resumeEditsAfterRestart,
    resumeTabRequests,
    stop,
    suspendForRestart,
  };
}
