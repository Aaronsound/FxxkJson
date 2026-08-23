// @vitest-environment node
import { parseTree } from 'jsonc-parser';
import { describe, expect, it, vi } from 'vitest';
import { getLocateCandidateOffsets } from './jsonWorkerLocateCandidates';
import { createJsonNodeEditOperations } from './jsonNodeEditOperations';
import type { NodeEditStructureCacheEntry, NodeEditViewerCacheEntry } from './jsonNodeEditOperations';

function createHarness() {
  const structureCache = new Map<string, NodeEditStructureCacheEntry>();
  const viewerCache = new Map<string, NodeEditViewerCacheEntry>();
  const directValueTreeCache = new Map();
  const latestFormatRequestByTab = new Map<string, number>();
  const nodeEditCache = new Map();
  const scheduleDeferredStructureWarmup = vi.fn();
  const operations = createJsonNodeEditOperations({
    clearDeferredStructureWarmup: vi.fn(),
    clearDirectValueWarmup: vi.fn(),
    directValueTreeCache,
    getLocateCandidateOffsets,
    getStructureWarmupDelayForTexts: vi.fn(() => 25),
    latestFormatRequestByTab,
    nodeEditCache,
    scheduleDeferredStructureWarmup,
    structureCache,
    viewerCache,
  });

  return {
    directValueTreeCache,
    latestFormatRequestByTab,
    nodeEditCache,
    operations,
    scheduleDeferredStructureWarmup,
    structureCache,
    viewerCache,
  };
}

describe('jsonNodeEditOperations', () => {
  it('reads a formatted node and caches matching raw/formatted ranges for later saves', () => {
    const { nodeEditCache, operations, structureCache } = createHarness();
    const rawText = '{"name":"old","count":1}';
    const formattedText = '{\n  "name": "old",\n  "count": 1\n}';
    structureCache.set('tab-a', {
      requestId: 3,
      rawText,
      formattedText,
      rawTree: parseTree(rawText),
      formattedTree: parseTree(formattedText),
    });

    const payload = JSON.parse(
      operations.readJsonNodeForEdit('tab-a', formattedText, formattedText.indexOf('"old"'))
    ) as {
      path: Array<string | number>;
      value: string;
    };

    expect(payload).toEqual({ path: ['name'], value: '"old"' });
    expect(nodeEditCache.get('tab-a')).toMatchObject({
      path: ['name'],
      rawStartOffset: rawText.indexOf('"old"'),
      formattedStartOffset: formattedText.indexOf('"old"'),
    });
  });

  it('saves a node and refreshes raw, formatted, viewer, and structure caches', () => {
    const { latestFormatRequestByTab, operations, scheduleDeferredStructureWarmup, structureCache, viewerCache } =
      createHarness();
    const rawText = '{"name":"old","count":1}';
    const formattedText = '{\n  "name": "old",\n  "count": 1\n}';
    latestFormatRequestByTab.set('tab-a', 9);
    structureCache.set('tab-a', {
      requestId: 9,
      rawText,
      formattedText,
      rawTree: parseTree(rawText),
      formattedTree: parseTree(formattedText),
    });

    operations.readJsonNodeForEdit('tab-a', formattedText, formattedText.indexOf('"old"'));
    const result = operations.saveJsonNodeForEdit('tab-a', '"new"', rawText, ['name']);

    expect(result.rawText).toBe('{"name":"new","count":1}');
    expect(result.formattedText).toBe('{\n  "name": "new",\n  "count": 1\n}');
    expect(result.rawMetrics).toMatchObject({ lineCount: 1, textByteLength: 24 });
    expect(result.formattedMetrics).toMatchObject({ lineCount: 4, textByteLength: 33 });
    expect(result.viewerData).toBeNull();
    expect(result.structureWarming).toBe(true);
    expect(viewerCache.has('tab-a')).toBe(false);
    expect(structureCache.get('tab-a')).toMatchObject({
      requestId: 9,
      rawText: result.rawText,
      formattedText: result.formattedText,
      rawTree: undefined,
      formattedTree: undefined,
    });
    expect(scheduleDeferredStructureWarmup).toHaveBeenCalledWith('tab-a', 9, 25);
  });

  it('deletes nodes and renames object keys through preserve-format helpers', () => {
    const { operations } = createHarness();
    const rawText = '{"name":"old","count":1}';

    expect(operations.deleteJsonNodeForEdit('tab-a', rawText, ['count'])).toBe('{"name":"old"}');
    expect(JSON.parse(operations.renameJsonNodeKeyForEdit('tab-a', 'title', rawText, ['name']))).toEqual({
      count: 1,
      title: 'old',
    });
  });
});
