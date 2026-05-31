import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonWorkerStructureOperations } from './jsonWorkerStructureOperations';

function createStructureHarness() {
  const directValueTreeCache = new Map();
  const directValueWarmupTimers = new Map();
  const deferredStructureWarmupTimers = new Map();
  const latestFormatRequestByTab = new Map();
  const structureCache = new Map();
  const viewerCache = new Map();
  const operations = createJsonWorkerStructureOperations({
    directValueTreeCache,
    directValueWarmupTimers,
    deferredStructureWarmupTimers,
    latestFormatRequestByTab,
    structureCache,
    viewerCache,
  });

  return {
    directValueTreeCache,
    directValueWarmupTimers,
    deferredStructureWarmupTimers,
    latestFormatRequestByTab,
    operations,
    structureCache,
    viewerCache,
  };
}

describe('jsonWorkerStructureOperations', () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('postMessage', postMessage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    postMessage.mockReset();
  });

  it('parses and caches raw/formatted structure trees on demand', () => {
    const { directValueTreeCache, operations, structureCache } = createStructureHarness();
    const cached: Record<string, unknown> = {
      requestId: 1,
      rawText: '{"a":1}',
      formattedText: '{\n  "a": 1\n}',
      rawTree: undefined,
      formattedTree: undefined,
    };

    expect(operations.ensureStructureTrees('tab-a', cached)).toBe(true);
    expect(cached.rawTree).toBeDefined();
    expect(cached.rawText).toBeUndefined();
    expect(cached.formattedTree).toBeDefined();
    expect(structureCache.get('tab-a')).toBe(cached);
    expect(directValueTreeCache.get('tab-a')).toMatchObject({ requestId: 1 });
  });

  it('reuses a direct value tree that matches the current request', () => {
    const { directValueTreeCache, operations } = createStructureHarness();
    const firstTree = operations.getDirectValueTree('tab-a', 7, '{"ok":true}');
    const secondTree = operations.getDirectValueTree('tab-a', 7, '{"ignored":true}');

    expect(secondTree).toBe(firstTree);
    expect(directValueTreeCache.get('tab-a')).toMatchObject({ requestId: 7, formattedTree: firstTree });
  });

  it('posts structure-ready after deferred warmup for the latest request', async () => {
    const { latestFormatRequestByTab, operations, structureCache } = createStructureHarness();
    latestFormatRequestByTab.set('tab-a', 3);
    structureCache.set('tab-a', {
      requestId: 3,
      rawText: '{"a":1}',
      formattedText: '{\n  "a": 1\n}',
      rawTree: undefined,
      formattedTree: undefined,
    });

    operations.scheduleDeferredStructureWarmup('tab-a', 3, 20);
    await vi.advanceTimersByTimeAsync(20);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'structure-ready',
      requestId: 3,
      tabId: 'tab-a',
      ready: true,
    });
  });

  it('ignores stale deferred warmup requests', async () => {
    const { latestFormatRequestByTab, operations, structureCache } = createStructureHarness();
    latestFormatRequestByTab.set('tab-a', 4);
    structureCache.set('tab-a', {
      requestId: 3,
      rawText: '{"a":1}',
      formattedText: '{\n  "a": 1\n}',
      rawTree: undefined,
      formattedTree: undefined,
    });

    operations.scheduleDeferredStructureWarmup('tab-a', 3, 20);
    await vi.advanceTimersByTimeAsync(20);

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('prewarms direct value trees only for the active formatted viewer text', async () => {
    const { directValueTreeCache, latestFormatRequestByTab, operations, viewerCache } = createStructureHarness();
    latestFormatRequestByTab.set('tab-a', 9);
    viewerCache.set('tab-a', {
      requestId: 9,
      formattedText: '{"active":true}',
      viewerData: {},
    });

    operations.scheduleDirectValueTreeWarmup('tab-a', 9, '{"active":true}');
    await vi.advanceTimersByTimeAsync(250);

    expect(directValueTreeCache.get('tab-a')).toMatchObject({ requestId: 9 });

    directValueTreeCache.clear();
    operations.scheduleDirectValueTreeWarmup('tab-a', 9, '{"stale":true}');
    await vi.advanceTimersByTimeAsync(250);

    expect(directValueTreeCache.has('tab-a')).toBe(false);
  });
});
