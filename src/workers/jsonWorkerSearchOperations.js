import { DEFAULT_SEARCH_OPTIONS, SEARCH_BATCH_SIZE } from '../types/jsonTool';
import { buildLineStarts, findTextSearchBatchAsync } from '../utils/searchText';

export function getSearchRequestKey(tabId, target) {
  return `${target}:${tabId}`;
}

export function createJsonWorkerSearchOperations({ latestSearchRequestByKey, rawSearchCache, viewerCache }) {
  function getNormalizedText(cached, key, text, searchOptions) {
    if (searchOptions.matchCase || searchOptions.useRegex) {
      return undefined;
    }

    if (typeof cached[key] !== 'string') {
      cached[key] = text.toLowerCase();
    }

    return cached[key];
  }

  function isLatestSearchRequest(tabId, target, requestId) {
    return latestSearchRequestByKey.get(getSearchRequestKey(tabId, target)) === requestId;
  }

  function postSearchResultIfLatest(payload) {
    if (!isLatestSearchRequest(payload.tabId, payload.target, payload.requestId)) {
      return;
    }

    postMessage(payload);
  }

  function postEmptySearchResult(message) {
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

  async function runSearchRequest(message) {
    const { requestId, tabId, target = 'right', query, searchOptions, startOffset = 0, append = false } = message;
    const shouldCancel = () => !isLatestSearchRequest(tabId, target, requestId);

    if (shouldCancel()) {
      return;
    }

    if (target === 'left') {
      if (typeof message.text === 'string') {
        rawSearchCache.set(tabId, {
          rawText: message.text,
          rawRevision: message.rawRevision ?? null,
          lineStarts: null,
          lowerRawText: null,
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
          shouldCancel,
          getNormalizedText(cachedRaw, 'lowerRawText', cachedRaw.rawText, effectiveSearchOptions)
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
        shouldCancel,
        getNormalizedText(cachedViewer, 'lowerFormattedText', cachedViewer.formattedText, effectiveSearchOptions)
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

  function handleSearchMessage(message) {
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
