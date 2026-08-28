// @vitest-environment node
import { parseTree } from 'jsonc-parser';
import { describe, expect, it, vi } from 'vitest';
import { getLocateCandidateOffsets } from './jsonWorkerLocateCandidates';
import { createJsonNodeEditOperations } from './jsonNodeEditOperations';
import type { NodeEditStructureCacheEntry, NodeEditViewerCacheEntry } from './jsonNodeEditOperations';

function createHarness() {
  const structureCache = new Map<string, NodeEditStructureCacheEntry>();
  const viewerCache = new Map<string, NodeEditViewerCacheEntry>();
  const latestFormatRequestByTab = new Map<string, number>();
  const nodeEditCache = new Map();
  const rawDocumentCache = new Map();
  const scheduleDeferredStructureWarmup = vi.fn();
  const getStructureWarmupDelayForByteLength = vi.fn(() => 25);
  const operations = createJsonNodeEditOperations({
    clearDeferredStructureWarmup: vi.fn(),
    getLocateCandidateOffsets,
    getStructureWarmupDelayForByteLength,
    latestFormatRequestByTab,
    nodeEditCache,
    rawDocumentCache,
    scheduleDeferredStructureWarmup,
    structureCache,
    viewerCache,
  });

  return {
    getStructureWarmupDelayForByteLength,
    latestFormatRequestByTab,
    nodeEditCache,
    operations,
    rawDocumentCache,
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

  it('reads and caches direct-locate node ranges without allocating syntax trees', () => {
    const { nodeEditCache, operations, structureCache } = createHarness();
    const rawText = '{"items":[{"name":"old"},{"name":"target"}]}';
    const formattedText =
      '{\n  "items": [\n    {\n      "name": "old"\n    },\n    {\n      "name": "target"\n    }\n  ]\n}';
    structureCache.set('tab-a', {
      directLocate: true,
      directLocateMode: 'token-search',
      requestId: 4,
      rawText,
      formattedText,
    });

    const payload = JSON.parse(
      operations.readJsonNodeForEdit('tab-a', formattedText, formattedText.indexOf('"target"'))
    ) as {
      path: Array<string | number>;
      value: string;
    };

    expect(payload).toEqual({ path: ['items', 1, 'name'], value: '"target"' });
    expect(nodeEditCache.get('tab-a')).toMatchObject({
      path: ['items', 1, 'name'],
      rawStartOffset: rawText.indexOf('"target"'),
      formattedStartOffset: formattedText.indexOf('"target"'),
    });
    expect(structureCache.get('tab-a')).not.toHaveProperty('rawTree');
    expect(structureCache.get('tab-a')).not.toHaveProperty('formattedTree');
  });

  it('saves a node and refreshes raw, formatted, viewer, and structure caches', () => {
    const {
      getStructureWarmupDelayForByteLength,
      latestFormatRequestByTab,
      operations,
      scheduleDeferredStructureWarmup,
      structureCache,
      viewerCache,
      rawDocumentCache,
    } = createHarness();
    const rawText = '{"name":"old","count":1}';
    const formattedText = '{\n  "name": "old",\n  "count": 1\n}';
    const rawMetrics = {
      exceedsDedicatedViewerLineThreshold: false,
      lineCount: 1,
      textByteLength: rawText.length,
    };
    const formattedMetrics = {
      exceedsDedicatedViewerLineThreshold: false,
      lineCount: 4,
      textByteLength: formattedText.length,
    };
    rawDocumentCache.set('tab-a', { rawMetrics, rawRevision: 5, rawText });
    latestFormatRequestByTab.set('tab-a', 9);
    structureCache.set('tab-a', {
      requestId: 9,
      rawText,
      formattedText,
      formattedMetrics,
      rawMetrics,
      rawTree: parseTree(rawText),
      formattedTree: parseTree(formattedText),
    });

    operations.readJsonNodeForEdit('tab-a', formattedText, formattedText.indexOf('"old"'));
    const result = operations.saveJsonNodeForEdit('tab-a', '"new"', undefined, ['name'], 5);

    expect(result.rawText).toBe('{"name":"new","count":1}');
    expect(result.formattedText).toBe('{\n  "name": "new",\n  "count": 1\n}');
    expect(result.rawMetrics).toMatchObject({ lineCount: 1, textByteLength: 24 });
    expect(result.formattedMetrics).toMatchObject({ lineCount: 4, textByteLength: 33 });
    expect(result.rawPatch).toEqual({
      sourceLength: rawText.length,
      startOffset: rawText.indexOf('"old"'),
      endOffset: rawText.indexOf('"old"') + '"old"'.length,
      text: '"new"',
    });
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
    expect(getStructureWarmupDelayForByteLength).toHaveBeenCalledWith(33, 150);
    expect(rawDocumentCache.get('tab-a')).toMatchObject({ rawRevision: 6, rawText: result.rawText });
  });

  it('patches an existing viewer line index for same-line scalar edits', () => {
    const { operations, structureCache, viewerCache } = createHarness();
    const rawText = '{"name":"old","count":1}';
    const formattedText = '{\n  "name": "old",\n  "count": 1\n}';
    viewerCache.set('tab-a', {
      requestId: 4,
      formattedText,
      viewerData: { lineCount: 4, lineStarts: Uint32Array.from([0, 2, 19, 32]) },
    });
    structureCache.set('tab-a', {
      directLocate: true,
      directLocateMode: 'token-search',
      requestId: 4,
      rawText,
      formattedText,
      viewerData: viewerCache.get('tab-a')!.viewerData,
    });

    operations.readJsonNodeForEdit('tab-a', formattedText, formattedText.indexOf('"old"'));
    const result = operations.saveJsonNodeForEdit('tab-a', '"updated"', rawText, ['name']);

    expect(result.viewerPatchApplied).toBe(true);
    expect(result.viewerData).toBeNull();
    expect(result.formattedPatch).not.toBeNull();
    expect(Array.from(viewerCache.get('tab-a')!.viewerData.lineStarts)).toEqual([0, 2, 23, 36]);
    expect(structureCache.get('tab-a')?.viewerData).toBe(viewerCache.get('tab-a')?.viewerData);
  });

  it('deletes nodes and renames object keys through preserve-format helpers', () => {
    const { operations, structureCache } = createHarness();
    const rawText = '{"name":"old","count":1}';
    const formattedText = '{\n  "name": "old",\n  "count": 1\n}';
    structureCache.set('tab-a', {
      requestId: 1,
      rawText,
      formattedText,
    });

    const deleted = operations.deleteJsonNodeForEdit('tab-a', rawText, ['count']);
    expect(deleted.rawText).toBe('{"name":"old"}');
    expect(deleted.formattedText).toBe('{\n  "name": "old"\n}');

    structureCache.set('tab-a', {
      requestId: 2,
      rawText,
      formattedText,
    });
    const renamed = operations.renameJsonNodeKeyForEdit('tab-a', 'title', rawText, ['name']);
    expect(JSON.parse(renamed.rawText)).toEqual({
      count: 1,
      title: 'old',
    });
    expect(renamed.formattedText).toContain('"title": "old"');
  });
});
