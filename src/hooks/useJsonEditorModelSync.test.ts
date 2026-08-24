import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJsonEditorModelSync } from './useJsonEditorModelSync';

const modelMocks = vi.hoisted(() => ({
  disposeModel: vi.fn(),
  getEditorLanguageByLength: vi.fn(() => 'json'),
  getLeftModelPath: vi.fn((tabId: string) => `left:${tabId}`),
  getOrCreateModel: vi.fn(),
  getRightModelPath: vi.fn((tabId: string) => `right:${tabId}`),
  recreateModel: vi.fn(),
}));

vi.mock('../utils/jsonToolModels', () => modelMocks);
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  Uri: { parse: vi.fn((value: string) => value) },
  editor: { getModel: vi.fn() },
}));

function ref<T>(current: T) {
  return { current } as MutableRefObject<T>;
}

function createHarness() {
  const model = {
    getLanguageId: vi.fn(() => 'json'),
    getValueLength: vi.fn(() => 2),
  };
  const leftEditor = {
    getModel: vi.fn(() => model),
    layout: vi.fn(),
    restoreViewState: vi.fn(),
    saveViewState: vi.fn(() => null),
    setModel: vi.fn(),
  };
  const rightEditor = {
    getModel: vi.fn(() => model),
    layout: vi.fn(),
    restoreViewState: vi.fn(),
    saveViewState: vi.fn(() => null),
    setModel: vi.fn(),
    updateOptions: vi.fn(),
  };
  const logEvent = vi.fn();
  const logRightEditorState = vi.fn();
  modelMocks.getOrCreateModel.mockReturnValue(model);
  modelMocks.recreateModel.mockReturnValue(model);

  const args = {
    activeTabIdRef: ref('tab-a'),
    largeModeRef: ref<Record<string, boolean>>({ 'tab-a': false }),
    largeViewerDataByTab: {},
    largeViewerStatusByTab: {},
    leftEditorRef: ref(leftEditor),
    leftViewStateByTabRef: ref({}),
    logEvent,
    logRightEditorState,
    rawTextByTabRef: ref({ 'tab-a': '{}' }),
    rightEditorRef: ref(rightEditor),
    rightViewStateByTabRef: ref({}),
    suppressLeftChangeRef: ref<Record<string, boolean>>({}),
  };

  return { args, leftEditor, logEvent, logRightEditorState, model, rightEditor };
}

describe('useJsonEditorModelSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lays out only when attaching a different left model', () => {
    const { args, leftEditor, model } = createHarness();
    const { result } = renderHook(() => useJsonEditorModelSync(args as never));

    act(() => result.current.syncLeftModel('tab-a', '{}', false, 2));
    expect(leftEditor.layout).not.toHaveBeenCalled();

    leftEditor.getModel.mockReturnValueOnce({} as typeof model);
    act(() => result.current.syncLeftModel('tab-a', '{}', false, 2));
    expect(leftEditor.setModel).toHaveBeenCalledWith(model);
    expect(leftEditor.layout).toHaveBeenCalledTimes(1);
  });

  it('leaves right editor options to the memoized editor component', () => {
    const { args, model, rightEditor } = createHarness();
    const { result } = renderHook(() => useJsonEditorModelSync(args as never));
    rightEditor.getModel.mockReturnValueOnce({} as typeof model);

    act(() => result.current.syncRightModel('tab-a', '{}', false, 2, 2));

    expect(rightEditor.setModel).toHaveBeenCalledWith(model);
    expect(rightEditor.layout).toHaveBeenCalledTimes(1);
    expect(rightEditor.updateOptions).not.toHaveBeenCalled();
  });
});
