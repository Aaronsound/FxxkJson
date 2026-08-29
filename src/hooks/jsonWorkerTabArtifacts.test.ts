import type { MutableRefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonWorkerTabArtifactActions } from './jsonWorkerTabArtifacts';

const modelMocks = vi.hoisted(() => ({
  disposeModel: vi.fn(),
  getLeftModelPath: vi.fn((tabId: string) => `left:${tabId}`),
  getRightModelPath: vi.fn((tabId: string) => `right:${tabId}`),
}));

vi.mock('../utils/jsonToolModels', () => modelMocks);

function ref<T>(current: T) {
  return { current } as MutableRefObject<T>;
}

function createActions() {
  const callbacks = {
    clearPerformanceState: vi.fn(),
    removeTabState: vi.fn(),
    setLargeRawViewerData: vi.fn(),
    setLargeViewerData: vi.fn(),
    setLargeViewerStatus: vi.fn(),
    setLocateFeedback: vi.fn(),
    setProcessingStage: vi.fn(),
    setTabError: vi.fn(),
    setTabFormatting: vi.fn(),
    setTabImporting: vi.fn(),
    setTabLargeMode: vi.fn(),
    updateFormattedContent: vi.fn(),
    updateTabContent: vi.fn(),
  };
  const refs = {
    formatTimersRef: ref<Record<string, number>>({ 'tab-a': 1 }),
    formattedTextByTabRef: ref<Record<string, string>>({ 'tab-a': 'formatted' }),
    largeFileLocateEnabledRef: ref<Record<string, boolean>>({ 'tab-a': true }),
    largeModeRef: ref<Record<string, boolean>>({ 'tab-a': true }),
    latestRequestRef: ref<Record<string, number>>({ 'tab-a': 4 }),
    leftViewStateByTabRef: ref<Record<string, null>>({ 'tab-a': null }),
    rawTextByTabRef: ref<Record<string, string>>({ 'tab-a': 'raw' }),
    rawRevisionByTabRef: ref<Record<string, number>>({ 'tab-a': 1 }),
    rightViewStateByTabRef: ref<Record<string, null>>({ 'tab-a': null }),
    structureStatusRef: ref<Record<string, 'ready' | 'building' | 'disabled'>>({ 'tab-a': 'building' }),
    workerStructureEnabledRef: ref<Record<string, boolean>>({ 'tab-a': true }),
  };
  const dependencies = {
    callbacksRef: ref(callbacks) as never,
    cancelInteractiveRequests: vi.fn(),
    clearFormatWatchdog: vi.fn(),
    clearPendingFormat: vi.fn(),
    clearTabStructure: vi.fn(),
    postWorkerRequest: vi.fn(),
    ...refs,
  };

  return { actions: createJsonWorkerTabArtifactActions(dependencies), callbacks, dependencies, refs };
}

describe('jsonWorkerTabArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets a tab while preserving its reusable artifacts', () => {
    const { actions, callbacks, dependencies } = createActions();

    actions.resetTabArtifacts('tab-a');

    expect(dependencies.clearPendingFormat).toHaveBeenCalledWith('tab-a');
    expect(dependencies.clearFormatWatchdog).toHaveBeenCalledWith('tab-a');
    expect(dependencies.clearTabStructure).toHaveBeenCalledWith('tab-a', 'ready');
    expect(callbacks.updateTabContent).toHaveBeenCalledWith('tab-a', '', true, 0);
    expect(callbacks.updateFormattedContent).toHaveBeenCalledWith('tab-a', '', true, 0, 0);
    expect(callbacks.setTabError).toHaveBeenCalledWith('tab-a', null);
  });

  it('removes worker, model, view-state, and text artifacts for a closed tab', () => {
    const { actions, callbacks, dependencies, refs } = createActions();

    actions.removeTabArtifacts('tab-a');

    expect(dependencies.postWorkerRequest).toHaveBeenCalledWith({ type: 'clear-structure', tabId: 'tab-a' });
    expect(dependencies.clearFormatWatchdog).toHaveBeenCalledWith('tab-a');
    expect(dependencies.cancelInteractiveRequests).toHaveBeenCalledWith('tab-a');
    expect(modelMocks.disposeModel).toHaveBeenCalledWith('left:tab-a');
    expect(modelMocks.disposeModel).toHaveBeenCalledWith('right:tab-a');
    expect(callbacks.removeTabState).toHaveBeenCalledWith('tab-a');
    expect(refs.rawTextByTabRef.current).not.toHaveProperty('tab-a');
    expect(refs.rawRevisionByTabRef.current).not.toHaveProperty('tab-a');
    expect(refs.formattedTextByTabRef.current).not.toHaveProperty('tab-a');
    expect(refs.largeModeRef.current).not.toHaveProperty('tab-a');
  });
});
