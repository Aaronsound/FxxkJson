import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRightEditorContextMenuState } from './useRightEditorContextMenuState';

describe('useRightEditorContextMenuState', () => {
  it('closes open context menus for escape and viewer mode changes', () => {
    const { rerender, result } = renderHook(
      ({ activeTabId, dedicated }) => useRightEditorContextMenuState(activeTabId, dedicated),
      {
        initialProps: { activeTabId: 'tab-1', dedicated: false },
      }
    );

    act(() => {
      result.current.setRightEditorContextMenu({ offset: 4, tabId: 'tab-1', x: 10, y: 20 });
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(result.current.rightEditorContextMenu).toBeNull();

    act(() => {
      result.current.setRightEditorContextMenu({ offset: 5, tabId: 'tab-1', x: 1, y: 2 });
    });
    rerender({ activeTabId: 'tab-1', dedicated: true });
    expect(result.current.rightEditorContextMenu).toBeNull();
  });
});
