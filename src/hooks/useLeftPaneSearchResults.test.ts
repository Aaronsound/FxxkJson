import { act, renderHook } from '@testing-library/react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { describe, expect, it, vi } from 'vitest';
import { useLeftPaneSearchResults } from './useLeftPaneSearchResults';

describe('left pane explicit navigation', () => {
  it('refreshes resized editor dimensions before selecting and revealing the target', () => {
    const calls: string[] = [];
    const editor = {
      getModel: () => ({ getPositionAt: (offset: number) => ({ lineNumber: 303, column: offset + 1 }) }),
      layout: vi.fn(() => calls.push('layout')),
      setSelection: vi.fn(() => calls.push('selection')),
      revealRangeInCenter: vi.fn(() => calls.push('reveal')),
      deltaDecorations: vi.fn(() => ['error-mark']),
    };
    const { result, unmount } = renderHook(() =>
      useLeftPaneSearchResults({
        activeTabId: 'a',
        activeTabIdRef: { current: 'a' },
        largeRawViewerRef: { current: null },
        leftEditorRef: { current: editor as unknown as monaco.editor.IStandaloneCodeEditor },
        leftMatches: [],
        leftMatchIndex: 0,
        leftSearchTerm: '',
        setIsLeftSearchLoadingMore: vi.fn(),
        setLeftMatches: vi.fn(),
        setLeftSearchHasMore: vi.fn(),
        setLeftSearchNextOffset: vi.fn(),
        shouldUseDedicatedLeftViewer: false,
      })
    );
    act(() => result.current.revealLeftRange(2, 3));
    expect(calls).toEqual(['layout', 'selection', 'reveal']);
    expect(editor.revealRangeInCenter).toHaveBeenCalledWith({
      startLineNumber: 303,
      startColumn: 3,
      endLineNumber: 303,
      endColumn: 4,
    });
    unmount();
  });
});
