import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonWorkerStructureOperations } from './jsonWorkerStructureOperations';
import type { StructureCacheEntry } from './jsonWorkerStructureOperations';

function createStructureHarness() {
  const deferredStructureWarmupTimers = new Map();
  const latestFormatRequestByTab = new Map();
  const structureCache = new Map();
  const operations = createJsonWorkerStructureOperations({
    deferredStructureWarmupTimers,
    latestFormatRequestByTab,
    structureCache,
  });

  return {
    deferredStructureWarmupTimers,
    latestFormatRequestByTab,
    operations,
    structureCache,
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

  it('selects warmup delay directly from an already measured byte length', () => {
    const { operations } = createStructureHarness();

    expect(operations.getStructureWarmupDelayForByteLength(16 * 1024 * 1024, 150)).toBe(1600);
  });

  it('parses and caches raw/formatted structure trees on demand', () => {
    const { operations, structureCache } = createStructureHarness();
    const cached: StructureCacheEntry = {
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
});
