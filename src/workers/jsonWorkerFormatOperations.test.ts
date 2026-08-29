// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerMessage, WorkerRequestMessage } from '../types/jsonTool';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { measureJsonDocument } from '../utils/jsonDocumentMetrics';
import { createJsonWorkerFormatOperations } from './jsonWorkerFormatOperations';

function createHarness() {
  const cancelInteractiveRequests = vi.fn();
  const clearDeferredStructureWarmup = vi.fn();
  const editJsonCache = new Map<string, { originalText?: string }>();
  const ensureStructureTrees = vi.fn(() => true);
  const latestFormatRequestByTab = new Map<string, number>();
  const nodeEditCache = new Map<string, unknown>();
  const rawDocumentCache = new Map();
  const scheduleDeferredStructureWarmup = vi.fn();
  const structureCache = new Map();
  const viewerCache = new Map();
  const operations = createJsonWorkerFormatOperations({
    cancelInteractiveRequests,
    clearDeferredStructureWarmup,
    editJsonCache,
    ensureStructureTrees,
    latestFormatRequestByTab,
    nodeEditCache,
    rawDocumentCache,
    scheduleDeferredStructureWarmup,
    structureCache,
    viewerCache,
  });

  return {
    cancelInteractiveRequests,
    clearDeferredStructureWarmup,
    editJsonCache,
    ensureStructureTrees,
    latestFormatRequestByTab,
    nodeEditCache,
    operations,
    rawDocumentCache,
    scheduleDeferredStructureWarmup,
    structureCache,
    viewerCache,
  };
}

function formatRequest(overrides: Partial<Extract<WorkerRequestMessage, { type: 'format' }>> = {}) {
  return {
    type: 'format',
    requestId: 1,
    tabId: 'tab-a',
    text: '{"value":1}',
    enableStructure: true,
    enableDirectLocate: false,
    deferStructure: false,
    buildViewer: false,
    ...overrides,
  } as Extract<WorkerRequestMessage, { type: 'format' }>;
}

describe('createJsonWorkerFormatOperations', () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    postMessage.mockReset();
  });

  it('prepares a new request and invalidates only incompatible caches', () => {
    const harness = createHarness();
    harness.editJsonCache.set('tab-a', { originalText: '{"old":true}' });
    harness.nodeEditCache.set('tab-a', {});
    harness.viewerCache.set('tab-a', {} as never);

    harness.operations.prepareFormatRequest('tab-a', 7, '{"next":true}');

    expect(harness.latestFormatRequestByTab.get('tab-a')).toBe(7);
    expect(harness.cancelInteractiveRequests).toHaveBeenCalledWith('tab-a');
    expect(harness.clearDeferredStructureWarmup).toHaveBeenCalledWith('tab-a');
    expect(harness.editJsonCache.has('tab-a')).toBe(false);
    expect(harness.nodeEditCache.has('tab-a')).toBe(false);
    expect(harness.viewerCache.has('tab-a')).toBe(false);
  });

  it('formats JSON, records raw metadata, and publishes structure readiness', async () => {
    const harness = createHarness();

    harness.operations.handleFormatMessage(formatRequest({ requestId: 8, rawRevision: 3 }) as never);
    await vi.runAllTimersAsync();

    const formatResult = postMessage.mock.calls.find(
      ([message]) => (message as WorkerMessage).type === 'format-result'
    );
    expect(formatResult?.[0]).toMatchObject({
      type: 'format-result',
      requestId: 8,
      tabId: 'tab-a',
      success: true,
      data: '{\n  "value": 1\n}',
    });
    expect(harness.rawDocumentCache.get('tab-a')).toMatchObject({
      rawRevision: 3,
      rawText: '{"value":1}',
    });
    expect(harness.ensureStructureTrees).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'structure-ready',
      requestId: 8,
      tabId: 'tab-a',
      ready: true,
    });
  });

  it('keeps dedicated viewing enabled for byte-large JSON with few lines', async () => {
    const harness = createHarness();
    const formatted = '{\n  "payload": "value"\n}';
    const metrics = {
      ...measureJsonDocument(formatted),
      textByteLength: LARGE_FILE_THRESHOLD,
    };
    harness.latestFormatRequestByTab.set('tab-large-line', 9);

    harness.operations.buildFormatArtifacts({
      requestId: 9,
      tabId: 'tab-large-line',
      sourceText: formatted,
      sourceMetrics: metrics,
      formatted,
      formattedMetrics: metrics,
      normalizedNestedString: false,
      enableStructure: false,
      enableDirectLocate: true,
      deferStructure: false,
      buildViewer: true,
    });
    await vi.runAllTimersAsync();

    const viewerReady = postMessage.mock.calls.find(([message]) => (message as WorkerMessage).type === 'viewer-ready');
    expect(viewerReady).toBeDefined();
    const viewerMessage = viewerReady?.[0] as WorkerMessage | undefined;
    expect(viewerMessage?.viewerData).toMatchObject({ lineCount: 3 });
    expect(viewerReady?.[1]).toHaveLength(2);
    expect(harness.viewerCache.get('tab-large-line')).toBeDefined();
    expect(harness.structureCache.get('tab-large-line')).toMatchObject({
      directLocate: true,
      directLocateMode: 'identity',
    });
  });

  it('ignores viewer and structure work after a newer request replaces it', async () => {
    const harness = createHarness();
    const formatted = '[\n  1\n]';
    const metrics = measureJsonDocument(formatted);
    harness.latestFormatRequestByTab.set('tab-stale', 11);

    harness.operations.buildFormatArtifacts({
      requestId: 10,
      tabId: 'tab-stale',
      sourceText: formatted,
      sourceMetrics: metrics,
      formatted,
      formattedMetrics: metrics,
      normalizedNestedString: false,
      enableStructure: true,
      enableDirectLocate: false,
      deferStructure: false,
      buildViewer: true,
    });
    harness.latestFormatRequestByTab.set('tab-stale', 11);
    await vi.runAllTimersAsync();

    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'viewer-ready' }), expect.anything());
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'structure-ready' }));
  });

  it('defers structure warmup when requested', () => {
    const harness = createHarness();

    harness.operations.handleFormatMessage(
      formatRequest({ requestId: 12, deferStructure: true, structureWarmupDelayMs: 75 }) as never
    );

    expect(harness.scheduleDeferredStructureWarmup).toHaveBeenCalledWith('tab-a', 12, 75);
    expect(harness.ensureStructureTrees).not.toHaveBeenCalled();
  });

  it('repairs invalid JSON and advances the raw revision', () => {
    const harness = createHarness();

    harness.operations.handleRepairMessage({
      ...formatRequest({ requestId: 13, rawRevision: 4 }),
      type: 'repair',
      text: '{value: 1}',
    } as never);

    const repairResult = postMessage.mock.calls.find(
      ([message]) => (message as WorkerMessage).type === 'repair-result'
    );
    expect(repairResult?.[0]).toMatchObject({
      type: 'repair-result',
      requestId: 13,
      success: true,
      repairedText: '{"value": 1}',
    });
    expect(harness.rawDocumentCache.get('tab-a')).toMatchObject({ rawRevision: 5, rawText: '{"value": 1}' });
  });

  it.each([
    ['format', '{invalid'],
    ['repair', ''],
  ] as const)('clears cached artifacts after a failed %s request', (type, text) => {
    const harness = createHarness();
    harness.structureCache.set('tab-a', {} as never);
    harness.viewerCache.set('tab-a', {} as never);
    const request = { ...formatRequest({ requestId: 14 }), type, text } as Extract<
      WorkerRequestMessage,
      { type: 'format' | 'repair' }
    >;

    if (type === 'format') {
      harness.operations.handleFormatMessage(request as never);
    } else {
      harness.operations.handleRepairMessage(request as never);
    }

    expect(harness.structureCache.has('tab-a')).toBe(false);
    expect(harness.viewerCache.has('tab-a')).toBe(false);
    expect(harness.clearDeferredStructureWarmup).toHaveBeenCalledWith('tab-a');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: `${type}-result`, requestId: 14, success: false, error: expect.any(String) })
    );
  });
});
