import type { MutableRefObject } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    WorkerMock.instances.push(this);
  }
}

function createArgs(): Parameters<typeof useJsonFormattingWorker>[0] {
  return {
    activeTabIdRef: ref('tab-a'),
    beginPerformanceSession: vi.fn(),
    clearLeftHighlights: vi.fn(),
    clearPerformanceState: vi.fn(),
    clearRightHighlights: vi.fn(),
    formattedTextByTabRef: ref<Record<string, string>>({}),
    largeFileLocateEnabledRef: ref<Record<string, boolean>>({}),
    largeModeRef: ref<Record<string, boolean>>({}),
    leftViewStateByTabRef: ref({}),
    logEvent: vi.fn(),
    mutatePerformanceSession: vi.fn(),
    performanceSessionsRef: ref<Record<string, PerformanceSession>>({}),
    rawTextByTabRef: ref<Record<string, string>>({}),
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
    updateFormattedContent: vi.fn(),
    updateTabContent: vi.fn(),
    workerStructureEnabledRef: ref<Record<string, boolean>>({}),
  };
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
});
