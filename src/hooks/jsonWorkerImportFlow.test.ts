import type { MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceSession } from './useJsonPerformanceTracking';
import { createJsonWorkerImportFlow } from './jsonWorkerImportFlow';

function ref<T>(current: T) {
  return { current } as MutableRefObject<T>;
}

function createSession(): PerformanceSession {
  return {
    error: null,
    fileSizeBytes: 0,
    formattedBytes: 0,
    largeMode: false,
    pendingFormat: true,
    rawBytes: 0,
    requestId: null,
    runId: 'run-1',
    sourceLabel: 'fixture',
    startedAt: 0,
    status: 'running',
    structureEnabled: false,
    trigger: 'import',
  };
}

function createFlow() {
  const session = createSession();
  const callbacks = {
    beginPerformanceSession: vi.fn(),
    logEvent: vi.fn(),
    mutatePerformanceSession: vi.fn((_tabId: string, mutate: (nextSession: PerformanceSession) => void) => {
      mutate(session);
    }),
    renameTab: vi.fn(),
    resetSearchState: vi.fn(),
    setLargeRawViewerData: vi.fn(),
    setLargeViewerData: vi.fn(),
    setLargeViewerStatus: vi.fn(),
    setLocateFeedback: vi.fn(),
    setProcessingStage: vi.fn(),
    setStructureStatus: vi.fn(),
    setTabError: vi.fn(),
    setTabFormatting: vi.fn(),
    setTabImporting: vi.fn(),
    setTabLargeMode: vi.fn(),
    updateFormattedContent: vi.fn(),
    updateTabContent: vi.fn(),
  };
  const largeFileLocateEnabledRef = ref<Record<string, boolean>>({});
  const workerStructureEnabledRef = ref<Record<string, boolean>>({});
  const queueFormatAfterImport = vi.fn();
  const flow = createJsonWorkerImportFlow({
    cancelInteractiveRequests: vi.fn(),
    getCallbacks: () => callbacks,
    largeFileLocateEnabledRef,
    postClearStructure: vi.fn(),
    queueFormatAfterImport,
    workerStructureEnabledRef,
  });

  return { callbacks, flow, largeFileLocateEnabledRef, queueFormatAfterImport, session, workerStructureEnabledRef };
}

describe('createJsonWorkerImportFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('imports text, syncs the raw model, and queues formatting', async () => {
    const { callbacks, flow, largeFileLocateEnabledRef, queueFormatAfterImport, session, workerStructureEnabledRef } =
      createFlow();
    largeFileLocateEnabledRef.current['tab-a'] = true;

    const importPromise = flow.importJsonText('tab-a', 'sample.json', 11, '{"ok":true}');
    await vi.advanceTimersByTimeAsync(0);
    await importPromise;

    expect(callbacks.beginPerformanceSession).toHaveBeenCalledWith('tab-a', 'import', 'sample.json', 11, 11, false);
    expect(callbacks.logEvent).toHaveBeenCalledWith(
      'import-start',
      expect.objectContaining({ fileName: 'sample.json' })
    );
    expect(callbacks.logEvent).toHaveBeenCalledWith('import-read-complete', expect.objectContaining({ rawLength: 11 }));
    expect(callbacks.renameTab).toHaveBeenCalledWith('tab-a', 'sample.json');
    expect(callbacks.updateTabContent).toHaveBeenCalledWith('tab-a', '{"ok":true}', true);
    expect(callbacks.updateFormattedContent).toHaveBeenCalledWith('tab-a', '', true);
    expect(callbacks.setTabFormatting).toHaveBeenLastCalledWith('tab-a', true);
    expect(callbacks.setProcessingStage).toHaveBeenLastCalledWith('tab-a', 'formatting');
    expect(queueFormatAfterImport).toHaveBeenCalledWith('tab-a', '{"ok":true}');
    expect(workerStructureEnabledRef.current['tab-a']).toBe(true);
    expect(session).toMatchObject({ rawBytes: 11, structureEnabled: true });
  });

  it('reports import failures and clears transient state', async () => {
    const { callbacks, flow, session } = createFlow();
    const file = {
      name: 'broken.json',
      size: 7,
      text: vi.fn().mockRejectedValue(new Error('cannot read')),
    } as unknown as File;

    const importPromise = flow.importJsonFile('tab-a', file);
    await vi.advanceTimersByTimeAsync(0);
    await importPromise;

    expect(callbacks.logEvent).toHaveBeenCalledWith(
      'import-failed',
      expect.objectContaining({ error: 'cannot read', fileName: 'broken.json' })
    );
    expect(callbacks.setTabImporting).toHaveBeenLastCalledWith('tab-a', null);
    expect(callbacks.setTabFormatting).toHaveBeenLastCalledWith('tab-a', false);
    expect(callbacks.setProcessingStage).toHaveBeenLastCalledWith('tab-a', 'idle');
    expect(callbacks.setTabError).toHaveBeenCalledWith('tab-a', '导入失败：cannot read');
    expect(session).toMatchObject({ error: 'cannot read', status: 'failed' });
  });
});
