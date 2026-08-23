import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerMessage } from '../types/jsonTool';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import { unpackSearchMatches } from '../utils/searchMatchPayload';
import { buildLineStarts } from '../utils/searchText';
import type { RawSearchCacheEntry, ViewerSearchCacheEntry } from './jsonWorkerSearchOperations';
import { createJsonWorkerSearchOperations, getSearchRequestKey } from './jsonWorkerSearchOperations';

function createOperations() {
  const latestSearchRequestByKey = new Map();
  const rawSearchCache = new Map<string, RawSearchCacheEntry>();
  const viewerCache = new Map<string, ViewerSearchCacheEntry>();
  const operations = createJsonWorkerSearchOperations({
    latestSearchRequestByKey,
    rawSearchCache,
    viewerCache,
  });

  return { latestSearchRequestByKey, operations, rawSearchCache, viewerCache };
}

function getPostedSearchResult(index = 0) {
  const message = vi.mocked(postMessage).mock.calls[index][0] as WorkerMessage;
  return {
    ...message,
    matches: unpackSearchMatches(message.matchData) ?? message.matches,
  };
}

async function flushSearchTimer() {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
}

describe('jsonWorkerSearchOperations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('postMessage', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('builds stable per-target request keys', () => {
    expect(getSearchRequestKey('tab-1', 'left')).toBe('left:tab-1');
    expect(getSearchRequestKey('tab-1', 'right')).toBe('right:tab-1');
  });

  it('searches and caches left raw text from incoming messages', async () => {
    const { operations, rawSearchCache } = createOperations();

    operations.handleSearchMessage({
      query: 'alpha',
      rawRevision: 2,
      requestId: 1,
      searchOptions: DEFAULT_SEARCH_OPTIONS,
      tabId: 'tab-a',
      target: 'left',
      text: '{"name":"Alpha"}\n{"name":"beta alpha"}',
    });
    await flushSearchTimer();

    const result = getPostedSearchResult();
    expect(result).toMatchObject({
      append: false,
      hasMore: false,
      query: 'alpha',
      requestId: 1,
      tabId: 'tab-a',
      target: 'left',
    });
    expect(result.matches).toHaveLength(2);
    expect(postMessage).toHaveBeenCalledWith(expect.any(Object), [expect.any(ArrayBuffer)]);
    const cachedRaw = rawSearchCache.get('tab-a');
    expect(cachedRaw).toMatchObject({
      rawRevision: 2,
      rawText: '{"name":"Alpha"}\n{"name":"beta alpha"}',
    });
    expect(cachedRaw?.lineStarts).toBeInstanceOf(Uint32Array);
    expect(cachedRaw).not.toHaveProperty('lowerRawText');
  });

  it('returns an empty left result when cached raw revision is stale', async () => {
    const { operations, rawSearchCache } = createOperations();
    rawSearchCache.set('tab-a', {
      lineStarts: buildLineStarts('{"name":"alpha"}'),
      rawRevision: 1,
      rawText: '{"name":"alpha"}',
    });

    operations.handleSearchMessage({
      query: 'alpha',
      rawRevision: 2,
      requestId: 1,
      searchOptions: DEFAULT_SEARCH_OPTIONS,
      tabId: 'tab-a',
      target: 'left',
    });
    await flushSearchTimer();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: [],
        nextStartOffset: 0,
        requestId: 1,
        target: 'left',
      })
    );
  });

  it('searches cached right viewer text and respects append metadata', async () => {
    const { operations, viewerCache } = createOperations();
    viewerCache.set('tab-a', {
      formattedText: '{\n  "name": "alpha",\n  "other": "Alpha"\n}',
      viewerData: {
        lineCount: 4,
        lineStarts: buildLineStarts('{\n  "name": "alpha",\n  "other": "Alpha"\n}'),
      },
    });

    operations.handleSearchMessage({
      append: true,
      query: 'alpha',
      requestId: 1,
      searchOptions: DEFAULT_SEARCH_OPTIONS,
      startOffset: 1,
      tabId: 'tab-a',
      target: 'right',
    });
    await flushSearchTimer();

    const result = getPostedSearchResult();
    expect(result).toMatchObject({
      append: true,
      hasMore: false,
      query: 'alpha',
      requestId: 1,
      tabId: 'tab-a',
      target: 'right',
    });
    expect(result.matches).toHaveLength(2);
    expect(postMessage).toHaveBeenCalledWith(expect.any(Object), [expect.any(ArrayBuffer)]);
    expect(viewerCache.get('tab-a')).not.toHaveProperty('lowerFormattedText');
  });

  it('does not post stale search results after a newer request arrives', async () => {
    const { operations, viewerCache } = createOperations();
    viewerCache.set('tab-a', {
      formattedText: '{"name":"alpha"}',
      viewerData: {
        lineCount: 1,
        lineStarts: buildLineStarts('{"name":"alpha"}'),
      },
    });

    operations.handleSearchMessage({
      query: 'alpha',
      requestId: 1,
      searchOptions: DEFAULT_SEARCH_OPTIONS,
      tabId: 'tab-a',
      target: 'right',
    });
    operations.handleSearchMessage({
      query: 'missing',
      requestId: 2,
      searchOptions: DEFAULT_SEARCH_OPTIONS,
      tabId: 'tab-a',
      target: 'right',
    });
    await flushSearchTimer();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ query: 'missing', requestId: 2 }));
    expect(operations.isLatestSearchRequest('tab-a', 'right', 1)).toBe(false);
    expect(operations.isLatestSearchRequest('tab-a', 'right', 2)).toBe(true);
  });
});
