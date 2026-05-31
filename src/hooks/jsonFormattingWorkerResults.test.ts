import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LargeJsonViewerData, LargeRawViewerData, StructureStatus, WorkerMessage } from '../types/jsonTool';
import { handleJsonFormattingWorkerResult } from './jsonFormattingWorkerResults';
import type { PerformanceSession } from './useJsonPerformanceTracking';

function ref<T>(current: T) {
  return { current } as MutableRefObject<T>;
}

function createSession(overrides: Partial<PerformanceSession> = {}): PerformanceSession {
  return {
    error: null,
    fileSizeBytes: null,
    formattedBytes: 0,
    largeMode: false,
    pendingFormat: false,
    rawBytes: 0,
    requestId: 1,
    runId: 'run-1',
    sourceLabel: 'fixture',
    startedAt: 0,
    status: 'running',
    structureEnabled: false,
    trigger: 'paste',
    ...overrides,
  };
}

function createContext(overrides: Partial<Parameters<typeof handleJsonFormattingWorkerResult>[1]> = {}) {
  const session = createSession();
  const callbacks = {
    logEvent: vi.fn(),
    mutatePerformanceSession: vi.fn((tabId: string, mutate: (nextSession: PerformanceSession) => void) => {
      if (tabId === 'tab-a') {
        mutate(session);
      }
    }),
    resetSearchState: vi.fn(),
    setLargeRawViewerData: vi.fn(),
    setLargeViewerData: vi.fn(),
    setLargeViewerStatus: vi.fn(),
    setLocateFeedback: vi.fn(),
    setProcessingStage: vi.fn(),
    setStructureStatus: vi.fn(),
    setTabError: vi.fn(),
    setTabFormatting: vi.fn(),
    setTabLargeMode: vi.fn(),
    syncPerformanceSnapshot: vi.fn(),
    updateFormattedContent: vi.fn(),
    updateTabContent: vi.fn(),
  };
  const context = {
    callbacks,
    clearFormatWatchdog: vi.fn(),
    formattedTextByTabRef: ref<Record<string, string>>({ 'tab-a': '{"ok":true}' }),
    latestRequestRef: ref<Record<string, number>>({ 'tab-a': 1 }),
    performanceSessionsRef: ref<Record<string, PerformanceSession>>({ 'tab-a': session }),
    rawTextByTabRef: ref<Record<string, string>>({ 'tab-a': '{"ok":true}' }),
    readWorkerText: (message: WorkerMessage) => message.data ?? null,
    readWorkerTextField: (
      message: WorkerMessage,
      stringKey: 'data' | 'repairedText',
      bufferKey: 'dataBuffer' | 'repairedTextBuffer'
    ) => {
      if (typeof message[stringKey] === 'string') {
        return message[stringKey] ?? null;
      }
      const buffer = message[bufferKey];
      return buffer ? new TextDecoder().decode(buffer) : null;
    },
    structureStatusRef: ref<Record<string, StructureStatus>>({ 'tab-a': 'building' }),
    ...overrides,
  };

  return { callbacks, context, session };
}

describe('handleJsonFormattingWorkerResult', () => {
  it('ignores unrelated worker messages and stale format requests', () => {
    const { callbacks, context } = createContext();

    expect(
      handleJsonFormattingWorkerResult(
        { requestId: 1, tabId: 'tab-a', type: 'search-result' } as WorkerMessage,
        context
      )
    ).toBe(false);
    expect(handleJsonFormattingWorkerResult({ requestId: 99, tabId: 'tab-a', type: 'format-result' }, context)).toBe(
      true
    );

    expect(callbacks.logEvent).not.toHaveBeenCalled();
  });

  it('applies a successful format result and clears the watchdog', () => {
    const rawViewerData = {
      ends: new Uint32Array([2]),
      rowCount: 1,
      starts: new Uint32Array([0]),
    } satisfies LargeRawViewerData;
    const { callbacks, context, session } = createContext();

    expect(
      handleJsonFormattingWorkerResult(
        {
          data: '{\n  "ok": true\n}',
          rawViewerData,
          requestId: 1,
          success: true,
          tabId: 'tab-a',
          type: 'format-result',
        },
        context
      )
    ).toBe(true);

    expect(context.clearFormatWatchdog).toHaveBeenCalledWith('tab-a');
    expect(callbacks.logEvent).toHaveBeenCalledWith('format-success', expect.objectContaining({ requestId: 1 }));
    expect(callbacks.setTabFormatting).toHaveBeenCalledWith('tab-a', false);
    expect(callbacks.setLargeRawViewerData).toHaveBeenCalledWith('tab-a', rawViewerData);
    expect(callbacks.updateFormattedContent).toHaveBeenCalledWith('tab-a', '{\n  "ok": true\n}', true);
    expect(callbacks.syncPerformanceSnapshot).toHaveBeenCalledWith('tab-a', true);
    expect(session).toMatchObject({ error: null, formattedBytes: 16, status: 'ready' });
  });

  it('surfaces a failed format result', () => {
    const { callbacks, context, session } = createContext();

    handleJsonFormattingWorkerResult(
      { error: 'bad json', requestId: 1, success: false, tabId: 'tab-a', type: 'format-result' },
      context
    );

    expect(callbacks.setLargeViewerData).toHaveBeenCalledWith('tab-a', null);
    expect(callbacks.updateFormattedContent).toHaveBeenCalledWith('tab-a', '', true);
    expect(callbacks.setStructureStatus).toHaveBeenCalledWith('tab-a', 'disabled');
    expect(callbacks.setTabError).toHaveBeenCalledWith('tab-a', 'bad json');
    expect(callbacks.mutatePerformanceSession).toHaveBeenCalledWith('tab-a', expect.any(Function), true);
    expect(session).toMatchObject({ error: 'bad json', status: 'failed' });
  });

  it('applies a successful repair result and resets search state', () => {
    const rawViewerData = {
      ends: new Uint32Array([7]),
      rowCount: 1,
      starts: new Uint32Array([0]),
    } satisfies LargeRawViewerData;
    const { callbacks, context, session } = createContext({
      rawTextByTabRef: ref<Record<string, string>>({ 'tab-a': '{ok:true}' }),
    });

    handleJsonFormattingWorkerResult(
      {
        data: '{\n  "ok": true\n}',
        rawViewerData,
        repairedText: '{"ok":true}',
        requestId: 1,
        success: true,
        tabId: 'tab-a',
        type: 'repair-result',
      },
      context
    );

    expect(context.clearFormatWatchdog).toHaveBeenCalledWith('tab-a');
    expect(callbacks.logEvent).toHaveBeenCalledWith('repair-success', expect.objectContaining({ requestId: 1 }));
    expect(callbacks.updateTabContent).toHaveBeenCalledWith('tab-a', '{"ok":true}', true);
    expect(callbacks.updateFormattedContent).toHaveBeenCalledWith('tab-a', '{\n  "ok": true\n}', true);
    expect(callbacks.setLargeRawViewerData).toHaveBeenCalledWith('tab-a', rawViewerData);
    expect(callbacks.resetSearchState).toHaveBeenCalled();
    expect(session).toMatchObject({ error: null, formattedBytes: 16, rawBytes: 11, status: 'ready' });
  });

  it('surfaces a failed repair result with a localized message', () => {
    const { callbacks, context, session } = createContext();

    handleJsonFormattingWorkerResult(
      { error: 'cannot repair', requestId: 1, success: false, tabId: 'tab-a', type: 'repair-result' },
      context
    );

    expect(callbacks.logEvent).toHaveBeenCalledWith(
      'repair-failed',
      expect.objectContaining({ error: 'cannot repair' })
    );
    expect(callbacks.setTabError).toHaveBeenCalledWith('tab-a', '修复失败：cannot repair');
    expect(callbacks.setStructureStatus).toHaveBeenCalledWith('tab-a', 'disabled');
    expect(session).toMatchObject({ error: 'cannot repair', status: 'failed' });
  });

  it('updates dedicated viewer state from viewer-ready messages', () => {
    const viewerData = { lineCount: 1, lineStarts: new Uint32Array([0]), regions: [] } satisfies LargeJsonViewerData;
    const { callbacks, context, session } = createContext({
      performanceSessionsRef: ref({ 'tab-a': createSession({ structureEnabled: true }) }),
    });

    handleJsonFormattingWorkerResult(
      { requestId: 1, tabId: 'tab-a', type: 'viewer-ready', viewerData, viewerIndexMs: 4.2 },
      context
    );

    expect(callbacks.setLargeViewerData).toHaveBeenCalledWith('tab-a', viewerData);
    expect(callbacks.setLargeViewerStatus).toHaveBeenCalledWith('tab-a', 'ready');
    expect(callbacks.setProcessingStage).toHaveBeenCalledWith('tab-a', 'building-index');
    expect(session.status).toBe('running');
  });

  it('marks structure ready and returns to idle when no viewer build is pending', () => {
    const { callbacks, context, session } = createContext();

    handleJsonFormattingWorkerResult({ ready: true, requestId: 1, tabId: 'tab-a', type: 'structure-ready' }, context);

    expect(callbacks.setStructureStatus).toHaveBeenCalledWith('tab-a', 'ready');
    expect(callbacks.setProcessingStage).toHaveBeenCalledWith('tab-a', 'idle');
    expect(session).toMatchObject({ status: 'ready' });
  });
});
