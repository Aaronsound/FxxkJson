import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useJsonPerformanceTracking } from './useJsonPerformanceTracking';

describe('useJsonPerformanceTracking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps orchestration callbacks stable across rerenders', () => {
    const activeTabIdRef = { current: 'tab-a' } as MutableRefObject<string>;
    const appendLog = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('electronAPI', { appendLog });
    const { result, rerender } = renderHook(() =>
      useJsonPerformanceTracking({ activeTabIdRef, initialTabId: 'tab-a' })
    );
    const firstCallbacks = {
      begin: result.current.beginPerformanceSession,
      clear: result.current.clearPerformanceState,
      log: result.current.logEvent,
      mutate: result.current.mutatePerformanceSession,
      sync: result.current.syncPerformanceSnapshot,
    };

    rerender();

    expect(result.current.beginPerformanceSession).toBe(firstCallbacks.begin);
    expect(result.current.clearPerformanceState).toBe(firstCallbacks.clear);
    expect(result.current.logEvent).toBe(firstCallbacks.log);
    expect(result.current.mutatePerformanceSession).toBe(firstCallbacks.mutate);
    expect(result.current.syncPerformanceSnapshot).toBe(firstCallbacks.sync);
  });

  it('publishes and records a completed performance session', () => {
    const activeTabIdRef = { current: 'tab-a' } as MutableRefObject<string>;
    const appendLog = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('electronAPI', { appendLog });
    const { result } = renderHook(() => useJsonPerformanceTracking({ activeTabIdRef, initialTabId: 'tab-a' }));

    act(() => result.current.beginPerformanceSession('tab-a', 'manual-format', 'sample.json', null, 128, false));
    act(() =>
      result.current.mutatePerformanceSession(
        'tab-a',
        (session) => {
          session.formattedBytes = 256;
          session.formatStartedAt = session.startedAt + 2;
          session.formatCompletedAt = session.startedAt + 8;
          session.status = 'ready';
        },
        true
      )
    );

    expect(result.current.performanceByTab['tab-a']).toMatchObject({
      formattedBytes: 256,
      formatWorkerMs: 6,
      rawBytes: 128,
      status: 'ready',
      trigger: 'manual-format',
    });
    expect(result.current.performanceHistory).toHaveLength(1);
    expect(appendLog).toHaveBeenCalled();
  });
});
