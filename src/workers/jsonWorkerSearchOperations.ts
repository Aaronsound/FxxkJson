import type { LargeJsonLineIndex, SearchTarget, WorkerMessage, WorkerSearchRequest } from '../types/jsonTool';
import { DEFAULT_SEARCH_OPTIONS, SEARCH_BATCH_SIZE } from '../types/jsonTool';
import { packSearchMatches } from '../utils/searchMatchPayload';
import { buildLineStarts, findTextSearchBatchAsync } from '../utils/searchText';
import { readMessageText } from './jsonWorkerTextPayload';

type SearchRequestMessage = WorkerSearchRequest & {
  append?: boolean;
  requestId: number;
  startOffset?: number;
  textBuffer?: ArrayBuffer;
  type?: 'search';
};

interface RawSearchCacheEntry {
  lineStarts: Uint32Array | null;
  rawRevision: number | null;
  rawText: string;
}

interface ViewerSearchCacheEntry {
  formattedText: string;
  viewerData: LargeJsonLineIndex;
}

interface JsonWorkerSearchOperationsArgs {
  latestSearchRequestByKey: Map<string, number>;
  rawSearchCache: Map<string, RawSearchCacheEntry>;
  viewerCache: Map<string, ViewerSearchCacheEntry>;
}

export function getSearchRequestKey(tabId: string, target: SearchTarget) {
  return `${target}:${tabId}`;
}

export function createJsonWorkerSearchOperations({
  latestSearchRequestByKey,
  rawSearchCache,
  viewerCache,
}: JsonWorkerSearchOperationsArgs) {
  function isLatestSearchRequest(tabId: string, target: SearchTarget, requestId: number) {
    return latestSearchRequestByKey.get(getSearchRequestKey(tabId, target)) === requestId;
  }

  function postSearchResultIfLatest(payload: WorkerMessage) {
    if (!isLatestSearchRequest(payload.tabId, payload.target ?? 'right', payload.requestId)) {
      return;
    }

    if (payload.matches && payload.matches.length > 0) {
      const matchData = packSearchMatches(payload.matches);
      const message = { ...payload, matches: undefined, matchData };
      (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(message, [
        matchData.buffer,
      ]);
      return;
    }

    postMessage(payload);
  }

  function postEmptySearchResult(message: SearchRequestMessage) {
    postSearchResultIfLatest({
      type: 'search-result',
      requestId: message.requestId,
      tabId: message.tabId,
      target: message.target ?? 'right',
      query: message.query,
      matches: [],
      hasMore: false,
      nextStartOffset: 0,
      append: Boolean(message.append),
    });
  }

  async function runSearchRequest(message: SearchRequestMessage) {
    const { requestId, tabId, target = 'right', query, searchOptions, startOffset = 0, append = false } = message;
    const shouldCancel = () => !isLatestSearchRequest(tabId, target, requestId);

    if (shouldCancel()) {
      return;
    }

    if (target === 'left') {
      if (typeof message.text === 'string' || message.textBuffer instanceof ArrayBuffer) {
        rawSearchCache.set(tabId, {
          rawText: readMessageText(message),
          rawRevision: message.rawRevision ?? null,
          lineStarts: null,
        });
      }

      const cachedRaw = rawSearchCache.get(tabId);
      if (
        !cachedRaw ||
        typeof cachedRaw.rawText !== 'string' ||
        (typeof message.rawRevision === 'number' && cachedRaw.rawRevision !== message.rawRevision)
      ) {
        postEmptySearchResult(message);
        return;
      }

      try {
        if (!(cachedRaw.lineStarts instanceof Uint32Array)) {
          cachedRaw.lineStarts = buildLineStarts(cachedRaw.rawText);
          rawSearchCache.set(tabId, cachedRaw);
        }

        if (shouldCancel()) {
          return;
        }

        const effectiveSearchOptions = searchOptions ?? DEFAULT_SEARCH_OPTIONS;
        const result = await findTextSearchBatchAsync(
          cachedRaw.rawText,
          cachedRaw.lineStarts,
          cachedRaw.lineStarts.length,
          typeof query === 'string' ? query : '',
          effectiveSearchOptions,
          startOffset,
          SEARCH_BATCH_SIZE,
          shouldCancel
        );

        if (result.cancelled || shouldCancel()) {
          return;
        }

        postSearchResultIfLatest({
          type: 'search-result',
          requestId,
          tabId,
          target,
          query,
          matches: result.matches,
          hasMore: result.hasMore,
          nextStartOffset: result.nextStartOffset,
          append,
        });
      } catch {
        postEmptySearchResult(message);
      }
      return;
    }

    const cachedViewer = viewerCache.get(tabId);

    if (!cachedViewer || typeof cachedViewer.formattedText !== 'string' || !cachedViewer.viewerData) {
      postEmptySearchResult(message);
      return;
    }

    try {
      const effectiveSearchOptions = searchOptions ?? DEFAULT_SEARCH_OPTIONS;
      const result = await findTextSearchBatchAsync(
        cachedViewer.formattedText,
        cachedViewer.viewerData.lineStarts,
        cachedViewer.viewerData.lineCount,
        typeof query === 'string' ? query : '',
        effectiveSearchOptions,
        startOffset,
        SEARCH_BATCH_SIZE,
        shouldCancel
      );

      if (result.cancelled || shouldCancel()) {
        return;
      }

      postSearchResultIfLatest({
        type: 'search-result',
        requestId,
        tabId,
        target,
        query,
        matches: result.matches,
        hasMore: result.hasMore,
        nextStartOffset: result.nextStartOffset,
        append,
      });
    } catch {
      postEmptySearchResult(message);
    }
  }

  function handleSearchMessage(message: SearchRequestMessage) {
    const target = message.target ?? 'right';
    latestSearchRequestByKey.set(getSearchRequestKey(message.tabId, target), message.requestId);
    setTimeout(() => {
      if (isLatestSearchRequest(message.tabId, target, message.requestId)) {
        void runSearchRequest({
          ...message,
          target,
        });
      }
    }, 0);
  }

  return {
    handleSearchMessage,
    isLatestSearchRequest,
  };
}

export type { RawSearchCacheEntry, SearchRequestMessage, ViewerSearchCacheEntry };
