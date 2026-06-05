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
    leftViewStateByTabRef: ref({}),
    logEvent: vi.fn(),
    mutatePerformanceSession: vi.fn(),
    performanceSessionsRef,
    rawTextByTabRef,
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
    expect(args.setTabError).toHaveBeenLastCalledWith(
      'tab-a',
      'JSON worker 加载失败：Failed to fetch dynamically imported module'
    );

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
    expect(args.setTabError).toHaveBeenLastCalledWith('tab-a', 'JSON worker 消息传输失败，请重试或重新导入文件');

    unmount();
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
              regions: [],
            },
            viewerIndexMs: 12,
          },
        })
      );
    });

    expect(args.updateTabContent).toHaveBeenCalledWith('tab-a', largeJson, true);
    expect(args.updateFormattedContent).toHaveBeenLastCalledWith('tab-a', formattedJson, true);
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
