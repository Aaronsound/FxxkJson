import type { MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT_DEBOUNCE_MS, LARGE_FILE_FORMAT_DEBOUNCE_MS } from '../types/jsonTool';
import type { WorkerRequestMessage } from '../types/jsonTool';
import { createJsonWorkerFormatQueue, FORMAT_WORKER_RESULT_TIMEOUT_MS } from './jsonWorkerFormatQueue';
import type { PerformanceSession } from './useJsonPerformanceTracking';

function recordRef<T>(current: T) {
  return { current } as MutableRefObject<T>;
}

function createSession(overrides: Partial<PerformanceSession> = {}): PerformanceSession {
  return {
    runId: 'run-1',
    requestId: null,
    pendingFormat: true,
    trigger: 'paste',
    sourceLabel: 'fixture',
    fileSizeBytes: null,
    rawBytes: 0,
    formattedBytes: 0,
    largeMode: false,
    structureEnabled: false,
    startedAt: 0,
    status: 'running',
    error: 'old',
    ...overrides,
  };
}

function createQueue() {
  const session = createSession();
  const requests: WorkerRequestMessage[] = [];
  const transfers: Transferable[][] = [];
  const callbacks = {
    logEvent: vi.fn(),
    mutatePerformanceSession: vi.fn((tabId: string, mutate: (session: PerformanceSession) => void) => {
      if (tabId === 'tab-a') {
        mutate(session);
      }
    }),
    setLargeRawViewerData: vi.fn(),
    setLargeViewerData: vi.fn(),
    setLargeViewerStatus: vi.fn(),
    setLocateFeedback: vi.fn(),
    setProcessingStage: vi.fn(),
    setStructureStatus: vi.fn(),
    setTabError: vi.fn(),
    setTabFormatting: vi.fn(),
    setTabLargeMode: vi.fn(),
    updateFormattedContent: vi.fn(),
  };
  const formatTimersRef = recordRef<Record<string, number>>({});
  const formatWatchdogTimersRef = recordRef<Record<string, number>>({});
  const latestRequestRef = recordRef<Record<string, number>>({});
  const requestCounterRef = recordRef(0);
  const workerStructureEnabledRef = recordRef<Record<string, boolean>>({});
  const queue = createJsonWorkerFormatQueue({
    callbacksRef: recordRef(callbacks),
    clearFormatWatchdog: vi.fn((tabId: string) => {
      const timer = formatWatchdogTimersRef.current[tabId];
      if (timer) {
        clearTimeout(timer);
        delete formatWatchdogTimersRef.current[tabId];
      }
    }),
    cancelInteractiveRequests: vi.fn(),
    clearPendingFormat: vi.fn((tabId: string) => {
      const timer = formatTimersRef.current[tabId];
      if (timer) {
        clearTimeout(timer);
        delete formatTimersRef.current[tabId];
      }
    }),
    clearTabStructure: vi.fn(),
    createWorkerTextPayload: (text) => ({
      message: { text },
      transfer: [],
    }),
    formatWatchdogTimersRef,
    formatTimersRef,
    largeFileLocateEnabledRef: recordRef<Record<string, boolean>>({}),
    largeModeRef: recordRef<Record<string, boolean>>({}),
    latestRequestRef,
    postWorkerRequest: (message, transfer = []) => {
      requests.push(message);
      transfers.push(transfer);
    },
    requestCounterRef,
    workerStructureEnabledRef,
  });

  return {
    callbacks,
    formatTimersRef,
    formatWatchdogTimersRef,
    latestRequestRef,
    queue,
    requests,
    session,
    transfers,
    workerStructureEnabledRef,
  };
}

describe('createJsonWorkerFormatQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears formatting state for empty text without posting worker requests', () => {
    const { callbacks, queue, requests, session } = createQueue();

    queue.queueFormat('tab-a', '   ');

    expect(requests).toHaveLength(0);
    expect(session).toMatchObject({
      pendingFormat: false,
      requestId: null,
      formattedBytes: 0,
      status: 'ready',
      error: null,
    });
    expect(callbacks.setTabFormatting).toHaveBeenCalledWith('tab-a', false);
    expect(callbacks.updateFormattedContent).toHaveBeenCalledWith('tab-a', '', true);
  });

  it('debounces normal format requests and records performance state', async () => {
    const { callbacks, latestRequestRef, queue, requests, session } = createQueue();

    queue.queueFormat('tab-a', '{"ok":true}');

    expect(requests).toHaveLength(0);
    expect(latestRequestRef.current['tab-a']).toBe(1);
    expect(session).toMatchObject({
      pendingFormat: false,
      requestId: 1,
      status: 'running',
      error: null,
    });
    expect(callbacks.logEvent).toHaveBeenCalledWith('format-queued', expect.objectContaining({ requestId: 1 }));

    await vi.advanceTimersByTimeAsync(FORMAT_DEBOUNCE_MS);

    expect(requests[0]).toMatchObject({
      type: 'format',
      requestId: 1,
      tabId: 'tab-a',
      text: '{"ok":true}',
    });
    expect(callbacks.logEvent).toHaveBeenCalledWith('format-start', expect.objectContaining({ requestId: 1 }));
    expect(session.formatStartedAt).toBeTypeOf('number');
  });

  it('uses the large-file debounce for large format requests', async () => {
    const { queue, requests } = createQueue();
    const largeText = `{"items":"${'x'.repeat(1024 * 1024 * 5)}"}`;

    queue.queueFormat('tab-a', largeText);
    await vi.advanceTimersByTimeAsync(FORMAT_DEBOUNCE_MS);
    expect(requests).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(LARGE_FILE_FORMAT_DEBOUNCE_MS - FORMAT_DEBOUNCE_MS);
    expect(requests[0]).toMatchObject({ type: 'format', text: largeText });
  });

  it('posts repair requests immediately and marks repair stage', () => {
    const { callbacks, queue, requests, session } = createQueue();

    queue.queueRepair('tab-a', '{ok:true}');

    expect(callbacks.setProcessingStage).toHaveBeenCalledWith('tab-a', 'repairing');
    expect(session).toMatchObject({
      pendingFormat: false,
      requestId: 1,
      status: 'running',
    });
    expect(requests[0]).toMatchObject({
      type: 'repair',
      requestId: 1,
      tabId: 'tab-a',
      text: '{ok:true}',
    });
  });

  it('reports a repair error for blank text', () => {
    const { callbacks, queue, requests } = createQueue();

    queue.queueRepair('tab-a', '');

    expect(requests).toHaveLength(0);
    expect(callbacks.setTabError).toHaveBeenLastCalledWith('tab-a', '没有可修复的 JSON 内容');
  });

  it('clears delayed import formatting before queueing an immediate request', async () => {
    const { formatTimersRef, queue, requests } = createQueue();

    queue.queueFormatAfterImport('tab-a', '{"a":1}');
    expect(formatTimersRef.current['tab-a']).toBeDefined();

    await vi.advanceTimersByTimeAsync(0);

    expect(formatTimersRef.current['tab-a']).toBeUndefined();
    expect(requests[0]).toMatchObject({ type: 'format', text: '{"a":1}' });
  });

  it('logs and surfaces a worker timeout when a format result never returns', async () => {
    const { callbacks, formatWatchdogTimersRef, queue, requests, session } = createQueue();

    queue.queueFormat('tab-a', '{"ok":true}', true);
    expect(requests[0]).toMatchObject({ type: 'format', requestId: 1 });
    expect(formatWatchdogTimersRef.current['tab-a']).toBeDefined();

    await vi.advanceTimersByTimeAsync(FORMAT_WORKER_RESULT_TIMEOUT_MS);

    expect(callbacks.logEvent).toHaveBeenCalledWith(
      'format-timeout',
      expect.objectContaining({
        error: expect.stringContaining('超时'),
        requestId: 1,
        timeoutMs: FORMAT_WORKER_RESULT_TIMEOUT_MS,
      })
    );
    expect(session).toMatchObject({
      requestId: 1,
      status: 'failed',
      error: expect.stringContaining('超时'),
    });
    expect(callbacks.setTabFormatting).toHaveBeenLastCalledWith('tab-a', false);
    expect(callbacks.setTabError).toHaveBeenLastCalledWith('tab-a', expect.stringContaining('超时'));
  });
});
