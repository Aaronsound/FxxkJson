import type { MutableRefObject } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type { StructureStatus } from '../types/jsonTool';
import { useJsonFormattingWorker } from './useJsonFormattingWorker';
import type { PerformanceSession } from './useJsonPerformanceTracking';

function ref<T>(current: T) {
  return { current } as MutableRefObject<T>;
}

class WorkerMock {
  static instances: WorkerMock[] = [];

  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    WorkerMock.instances.push(this);
  }
}

function createArgs(): Parameters<typeof useJsonFormattingWorker>[0] {
  const rawTextByTabRef = ref<Record<string, string>>({});
  const rawRevisionByTabRef = ref<Record<string, number>>({});
  const formattedTextByTabRef = ref<Record<string, string>>({});
  const performanceSessionsRef = ref<Record<string, PerformanceSession>>({});

  return {
    activeTabIdRef: ref('tab-a'),
    beginPerformanceSession: vi.fn(),
    clearLeftHighlights: vi.fn(),
    clearPerformanceState: vi.fn(),
    clearRightHighlights: vi.fn(),
    formattedTextByTabRef,
    largeFileLocateEnabledRef: ref<Record<string, boolean>>({}),
    largeModeRef: ref<Record<string, boolean>>({}),
    leftSearchWorkerRevisionRef: ref<Record<string, number>>({}),
    leftViewStateByTabRef: ref({}),
    logEvent: vi.fn(),
    mutatePerformanceSession: vi.fn(),
    performanceSessionsRef,
    rawTextByTabRef,
    rawRevisionByTabRef,
    removeTabState: vi.fn(),
    renameTab: vi.fn(),
    resetSearchState: vi.fn(),
    revealLeftRange: vi.fn(),
    rightViewStateByTabRef: ref({}),
    setLargeRawViewerData: vi.fn(),
    setLargeViewerData: vi.fn(),
    setLargeViewerSearchResults: vi.fn(),
    setLargeViewerStatus: vi.fn(),
    setLeftSearchResults: vi.fn(),
    setLocateFeedback: vi.fn(),
    setProcessingStage: vi.fn(),
    setRightNodeSelection: vi.fn(),
    setStructureStatus: vi.fn(),
    setTabError: vi.fn(),
    setTabFormatting: vi.fn(),
    setTabImporting: vi.fn(),
    setTabLargeMode: vi.fn(),
    structureStatusRef: ref<Record<string, StructureStatus>>({}),
    syncPerformanceSnapshot: vi.fn(),
    updateFormattedContent: vi.fn((tabId: string, content: string) => {
      formattedTextByTabRef.current[tabId] = content;
    }),
    updateTabContent: vi.fn((tabId: string, content: string) => {
      rawTextByTabRef.current[tabId] = content;
    }),
    workerStructureEnabledRef: ref<Record<string, boolean>>({}),
  };
}

function installPerformanceSessionHarness(args: Parameters<typeof useJsonFormattingWorker>[0]) {
  vi.mocked(args.beginPerformanceSession).mockImplementation(
    (tabId, trigger, sourceLabel, fileSizeBytes, rawBytes, largeMode) => {
      args.performanceSessionsRef.current[tabId] = {
        error: null,
        fileSizeBytes,
        formattedBytes: 0,
        largeMode,
        pendingFormat: true,
        rawBytes,
        requestId: null,
        runId: 'test-run',
        sourceLabel,
        startedAt: performance.now(),
        status: 'running',
        structureEnabled: false,
        trigger,
      };
    }
  );
  vi.mocked(args.mutatePerformanceSession).mockImplementation((tabId, mutate, shouldLog) => {
    const session = args.performanceSessionsRef.current[tabId];
    if (session) {
      mutate(session);
    }
    if (shouldLog) {
      args.syncPerformanceSnapshot(tabId, true);
    }
  });
}

describe('useJsonFormattingWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    WorkerMock.instances = [];
  });

  it('keeps the active worker across ordinary rerenders', () => {
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();

    const { rerender, unmount } = renderHook(
      ({ tick }) => {
        void tick;
        return useJsonFormattingWorker(args);
      },
      { initialProps: { tick: 0 } }
    );

    expect(WorkerMock.instances).toHaveLength(1);

    rerender({ tick: 1 });

    expect(WorkerMock.instances).toHaveLength(1);
    expect(WorkerMock.instances[0].terminate).not.toHaveBeenCalled();

    unmount();
    expect(WorkerMock.instances[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('surfaces worker load errors and clears active formatting state', () => {
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();
    const { result, unmount } = renderHook(() => useJsonFormattingWorker(args));

    act(() => {
      result.current.queueFormat('tab-a', '{"ok":true}', true);
    });

    act(() => {
      WorkerMock.instances[0].onerror?.(
        new ErrorEvent('error', {
          colno: 3,
          filename: 'jsonParser.worker.js',
          lineno: 2,
          message: 'Failed to fetch dynamically imported module',
        })
      );
    });

    expect(args.logEvent).toHaveBeenCalledWith(
      'worker-error',
      expect.objectContaining({
        message: 'Failed to fetch dynamically imported module',
        source: 'jsonParser.worker.js',
      })
    );
    expect(args.setTabFormatting).toHaveBeenLastCalledWith('tab-a', false);
    expect(args.setProcessingStage).toHaveBeenLastCalledWith('tab-a', 'idle');
    expect(args.setTabError).toHaveBeenLastCalledWith('tab-a', 'JSON Worker 异常，正在自动恢复');

    unmount();
  });

  it('surfaces worker message transfer errors and clears active formatting state', () => {
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();
    const { result, unmount } = renderHook(() => useJsonFormattingWorker(args));

    act(() => {
      result.current.queueFormat('tab-a', '{"ok":true}', true);
    });

    act(() => {
      WorkerMock.instances[0].onmessageerror?.(new MessageEvent('messageerror'));
    });

    expect(args.logEvent).toHaveBeenCalledWith('worker-message-error', {
      message: 'JSON worker message transfer failed',
    });
    expect(args.setTabFormatting).toHaveBeenLastCalledWith('tab-a', false);
    expect(args.setProcessingStage).toHaveBeenLastCalledWith('tab-a', 'idle');
    expect(args.setTabError).toHaveBeenLastCalledWith('tab-a', 'JSON Worker 通信异常，正在自动恢复');

    unmount();
  });

  it('releases inactive-tab transient worker state without clearing its structure', () => {
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();
    args.leftSearchWorkerRevisionRef.current['tab-a'] = 7;
    const { result, unmount } = renderHook(() => useJsonFormattingWorker(args));

    act(() => {
      result.current.releaseTransientWorkerCaches('tab-a');
    });

    expect(args.leftSearchWorkerRevisionRef.current['tab-a']).toBeUndefined();
    expect(WorkerMock.instances[0].postMessage).toHaveBeenCalledWith(
      {
        type: 'release-transient-cache',
        tabId: 'tab-a',
      },
      []
    );
    expect(WorkerMock.instances[0].postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clear-tab-cache', tabId: 'tab-a' })
    );
    expect(WorkerMock.instances[0].postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clear-locate-cache', tabId: 'tab-a' })
    );

    unmount();
  });

  it('clears only locate data when large-file locate is disabled', () => {
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();
    const { result, unmount } = renderHook(() => useJsonFormattingWorker(args));

    act(() => {
      result.current.clearTabStructure('tab-a', 'disabled');
    });

    expect(WorkerMock.instances[0].postMessage).toHaveBeenCalledWith(
      { type: 'clear-locate-cache', tabId: 'tab-a' },
      []
    );
    expect(WorkerMock.instances[0].postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clear-tab-cache', tabId: 'tab-a' }),
      expect.anything()
    );
    expect(args.setStructureStatus).toHaveBeenCalledWith('tab-a', 'disabled');

    unmount();
  });

  it('restores an evicted large-viewer cache only when that tab becomes active again', () => {
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();
    const { result, unmount } = renderHook(() => useJsonFormattingWorker(args));
    const viewerData = {
      lineCount: 2,
      lineStarts: new Uint32Array([0, 8]),
      regions: {
        startLines: new Uint32Array(0),
        endLines: new Uint32Array(0),
        parentIndexes: new Int32Array(0),
        kinds: new Uint8Array(0),
      },
    };

    act(() => {
      WorkerMock.instances[0].onmessage?.(
        new MessageEvent('message', {
          data: { type: 'viewer-cache-evicted', requestId: 0, tabId: 'tab-a' },
        })
      );
    });
    act(() => {
      result.current.restoreWorkerTabCache({
        tabId: 'tab-a',
        rawText: '{"a":1}',
        rawRevision: 1,
        formattedText: '{\n  "a": 1\n}',
        viewerData,
        enableDirectLocate: false,
      });
    });

    expect(WorkerMock.instances[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hydrate-viewer-cache',
        tabId: 'tab-a',
        formattedText: '{\n  "a": 1\n}',
        viewerData: expect.objectContaining({ lineCount: 2 }),
      }),
      expect.any(Array)
    );

    unmount();
  });

  it('restarts a failed worker and retries an in-flight format', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();
    installPerformanceSessionHarness(args);
    args.beginPerformanceSession('tab-a', 'manual-format', 'recovery', null, 11, false);
    args.rawTextByTabRef.current['tab-a'] = '{"ok":true}';
    const { result, unmount } = renderHook(() => useJsonFormattingWorker(args));

    act(() => {
      result.current.queueFormat('tab-a', '{"ok":true}', true);
      WorkerMock.instances[0].onerror?.(new ErrorEvent('error', { message: 'worker crashed' }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(WorkerMock.instances).toHaveLength(2);
    expect(WorkerMock.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(WorkerMock.instances[1].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'format', tabId: 'tab-a', text: '{"ok":true}' }),
      []
    );
    expect(args.logEvent).toHaveBeenCalledWith('worker-restarted', { attempt: 1 });

    unmount();
    vi.useRealTimers();
  });

  it('recovers edit immediately and cached search and locate after viewer hydration', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();
    args.formattedTextByTabRef.current['tab-a'] = '{\n  "ok": true\n}';
    args.largeModeRef.current['tab-a'] = true;
    const { result, unmount } = renderHook(() => useJsonFormattingWorker(args));
    let edit: Promise<string>;

    act(() => {
      edit = result.current.requestWorkerEditJson({
        tabId: 'tab-a',
        operation: 'escape-json',
        text: '{"ok":true}',
      });
      result.current.requestWorkerSearch({
        tabId: 'tab-a',
        query: 'ok',
        searchOptions: { matchCase: false, useRegex: false, wholeWord: false },
      });
      result.current.requestWorkerLocate('tab-a', 5);
      WorkerMock.instances[0].onerror?.(new ErrorEvent('error', { message: 'worker crashed' }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const restartedWorker = WorkerMock.instances[1];
    expect(restartedWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'edit-json', operation: 'escape-json', text: '{"ok":true}' }),
      []
    );
    expect(restartedWorker.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'search' }),
      expect.anything()
    );

    act(() => {
      restartedWorker.onmessage?.(
        new MessageEvent('message', {
          data: { type: 'viewer-cache-restored', requestId: 10, tabId: 'tab-a' },
        })
      );
    });

    expect(restartedWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'search', query: 'ok', tabId: 'tab-a' }),
      []
    );
    expect(restartedWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'locate-right-direct', offset: 5, tabId: 'tab-a' }),
      []
    );
    const recoveredEditRequest = restartedWorker.postMessage.mock.calls.find(
      ([message]) => message.type === 'edit-json'
    )?.[0];
    act(() => {
      restartedWorker.onmessage?.(
        new MessageEvent('message', {
          data: {
            type: 'edit-json-result',
            requestId: recoveredEditRequest.requestId,
            tabId: 'tab-a',
            success: true,
            data: '"{\\"ok\\":true}"',
          },
        })
      );
    });

    await expect(edit!).resolves.toBe('"{\\"ok\\":true}"');
    unmount();
    vi.useRealTimers();
  });

  it('finishes a large JSON import after format and viewer-ready worker messages', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', WorkerMock);
    const args = createArgs();
    installPerformanceSessionHarness(args);
    const { result, unmount } = renderHook(() => useJsonFormattingWorker(args));
    const largeJson = `{"payload":"${'x'.repeat(LARGE_FILE_THRESHOLD)}"}`;
    const formattedJson = `{\n  "payload": "${'x'.repeat(LARGE_FILE_THRESHOLD)}"\n}`;

    const importPromise = result.current.importJsonText('tab-a', 'large.json', largeJson.length, largeJson);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await importPromise;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });

    const formatRequest = WorkerMock.instances[0].postMessage.mock.calls.find(
      ([message]) => message.type === 'format'
    )?.[0];
    expect(formatRequest).toMatchObject({
      buildViewer: true,
      enableStructure: false,
      requestId: 1,
      tabId: 'tab-a',
      type: 'format',
    });
    expect(formatRequest.textBuffer).toBeDefined();
    expect(formatRequest.text).toBeUndefined();
    expect(args.setTabFormatting).toHaveBeenLastCalledWith('tab-a', true);
    expect(args.setProcessingStage).toHaveBeenLastCalledWith('tab-a', 'formatting');

    act(() => {
      WorkerMock.instances[0].onmessage?.(
        new MessageEvent('message', {
          data: {
            type: 'format-result',
            requestId: 1,
            tabId: 'tab-a',
            success: true,
            data: formattedJson,
            rawViewerData: null,
          },
        })
      );
    });

    expect(args.setTabFormatting).toHaveBeenLastCalledWith('tab-a', false);
    expect(args.setLargeViewerStatus).toHaveBeenLastCalledWith('tab-a', 'building');
    expect(args.setProcessingStage).toHaveBeenLastCalledWith('tab-a', 'building-viewer');

    act(() => {
      WorkerMock.instances[0].onmessage?.(
        new MessageEvent('message', {
          data: {
            type: 'viewer-ready',
            requestId: 1,
            tabId: 'tab-a',
            viewerData: {
              lineCount: 3,
              lineStarts: new Uint32Array([0, 2, formattedJson.length - 2]),
              regions: {
                startLines: new Uint32Array(0),
                endLines: new Uint32Array(0),
                parentIndexes: new Int32Array(0),
                kinds: new Uint8Array(0),
              },
            },
            viewerIndexMs: 12,
          },
        })
      );
    });

    expect(args.updateTabContent).toHaveBeenCalledWith('tab-a', largeJson, true, largeJson.length);
    expect(args.updateFormattedContent).toHaveBeenLastCalledWith(
      'tab-a',
      formattedJson,
      false,
      formattedJson.length,
      largeJson.length
    );
    expect(args.setLargeViewerStatus).toHaveBeenLastCalledWith('tab-a', 'ready');
    expect(args.setProcessingStage).toHaveBeenLastCalledWith('tab-a', 'idle');
    expect(args.setTabError).toHaveBeenLastCalledWith('tab-a', null);
    expect(args.performanceSessionsRef.current['tab-a']).toMatchObject({
      error: null,
      requestId: 1,
      status: 'ready',
      structureEnabled: false,
      viewerIndexMs: 12,
    });

    unmount();
    vi.useRealTimers();
  });
});
