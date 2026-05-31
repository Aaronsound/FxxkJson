import type { MutableRefObject } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LargeJsonReadonlyViewerHandle } from '../components/LargeJsonReadonlyViewer';
import type { RightNodeSelection } from '../types/jsonTool';
import { useRightPaneNavigationActions } from './useRightPaneNavigationActions';

function ref<T>(current: T) {
  return { current } as MutableRefObject<T>;
}

function createEditor() {
  const lines = [
    '{',
    '  "nested": {',
    '    "requestId": "req-00032375",',
    '    "timestamp": "2026-04-27T00:00:00.000Z"',
    '  }',
    '}',
  ];
  return {
    focus: vi.fn(),
    getAction: vi.fn(() => ({ run: vi.fn() })),
    getModel: vi.fn(() => ({
      getLineContent: vi.fn((lineNumber: number) => lines[lineNumber - 1] ?? ''),
      getLineCount: vi.fn(() => lines.length),
      getPositionAt: vi.fn((offset: number) => ({ column: offset + 1, lineNumber: 1 })),
    })),
    revealRangeInCenter: vi.fn(),
    setPosition: vi.fn(),
    setSelection: vi.fn(),
  };
}

function createArgs(overrides: Partial<Parameters<typeof useRightPaneNavigationActions>[0]> = {}) {
  const selection: RightNodeSelection = {
    endOffset: 12,
    path: null,
    pathText: '$.name',
    startOffset: 7,
    updatedAt: 1,
  };
  return {
    activeRightNodeSelection: selection,
    activeTab: { id: 'tab-a', title: 'demo' },
    activeTabIdRef: ref('tab-a'),
    getPinnedPath: vi.fn(() => ({ endOffset: 12, pathText: '$.name', startOffset: 7 })),
    largeViewerRef: ref<LargeJsonReadonlyViewerHandle | null>(null),
    pinRightPath: vi.fn(),
    requestWorkerLocate: vi.fn(),
    rightEditorRef: ref(createEditor() as never),
    setRightNodeSelection: vi.fn(),
    shouldUseDedicatedRightViewer: false,
    ...overrides,
  };
}

describe('useRightPaneNavigationActions', () => {
  it('pins the current right node selection', () => {
    const args = createArgs();
    const { result } = renderHook(() => useRightPaneNavigationActions(args));

    result.current.pinActiveRightPath();

    expect(args.pinRightPath).toHaveBeenCalledWith('tab-a', args.activeRightNodeSelection);
  });

  it('selects pinned paths and requests locate', () => {
    const args = createArgs();
    const { result } = renderHook(() => useRightPaneNavigationActions(args));

    result.current.selectRightPinnedPath('pin-1');

    expect(args.getPinnedPath).toHaveBeenCalledWith('tab-a', 'pin-1');
    expect(args.setRightNodeSelection).toHaveBeenCalledWith(
      'tab-a',
      expect.objectContaining({ endOffset: 12, pathText: '$.name', startOffset: 7 })
    );
    expect(args.requestWorkerLocate).toHaveBeenCalledWith('tab-a', 7);
    expect(args.rightEditorRef.current?.revealRangeInCenter).toHaveBeenCalled();
  });

  it('reveals offsets in the dedicated large viewer when active', () => {
    const revealOffset = vi.fn();
    const args = createArgs({
      largeViewerRef: ref({ revealOffset } as unknown as LargeJsonReadonlyViewerHandle),
      shouldUseDedicatedRightViewer: true,
    });
    const { result } = renderHook(() => useRightPaneNavigationActions(args));

    result.current.revealRightOffset(42);

    expect(revealOffset).toHaveBeenCalledWith(42);
    expect(args.rightEditorRef.current?.revealRangeInCenter).not.toHaveBeenCalled();
  });

  it('toggles right folds only for the active tab', () => {
    const editor = createEditor();
    const action = { run: vi.fn() };
    editor.getAction.mockReturnValue(action);
    const args = createArgs({ rightEditorRef: ref(editor as never) });
    const { result } = renderHook(() => useRightPaneNavigationActions(args));

    result.current.toggleRightFoldAtOffset('tab-b', 2);
    expect(action.run).not.toHaveBeenCalled();

    result.current.toggleRightFoldAtOffset('tab-a', 2);
    expect(editor.setPosition).toHaveBeenCalledWith({ column: 1, lineNumber: 1 });
    expect(action.run).toHaveBeenCalledTimes(1);
  });

  it('toggles the closest foldable parent when the offset points at a scalar field', () => {
    const editor = createEditor();
    const action = { run: vi.fn() };
    editor.getAction.mockReturnValue(action);
    editor.getModel.mockReturnValue({
      getLineContent: vi.fn(
        (lineNumber: number) =>
          [
            '{',
            '  "nested": {',
            '    "requestId": "req-00032375",',
            '    "timestamp": "2026-04-27T00:00:00.000Z"',
            '  }',
            '}',
          ][lineNumber - 1] ?? ''
      ),
      getLineCount: vi.fn(() => 6),
      getPositionAt: vi.fn(() => ({ column: 18, lineNumber: 4 })),
    });
    const args = createArgs({ rightEditorRef: ref(editor as never) });
    const { result } = renderHook(() => useRightPaneNavigationActions(args));

    result.current.toggleRightFoldAtOffset('tab-a', 99);

    expect(editor.setPosition).toHaveBeenCalledWith({ column: 1, lineNumber: 2 });
    expect(action.run).toHaveBeenCalledTimes(1);
  });
});
