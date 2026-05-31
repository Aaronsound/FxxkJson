import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useContextualFindShortcut } from './useContextualFindShortcut';

describe('useContextualFindShortcut', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.electronAPI = undefined;
  });

  it('opens the focused pane for Cmd/Ctrl+F and skips modal focus', () => {
    const openLeftFind = vi.fn();
    const openRightFind = vi.fn();

    renderHook(() => useContextualFindShortcut({ openLeftFind, openRightFind }));

    document.body.innerHTML = '<section class="left-editor-pane"><button>raw</button></section>';
    document.querySelector('button')?.focus();
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(openLeftFind).toHaveBeenCalledTimes(1);
    expect(openRightFind).not.toHaveBeenCalled();

    document.body.innerHTML = '<section class="modal-overlay"><button>modal</button></section>';
    document.querySelector('button')?.focus();
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(openLeftFind).toHaveBeenCalledTimes(1);
    expect(openRightFind).not.toHaveBeenCalled();

    document.body.innerHTML = '<button>formatted</button>';
    document.querySelector('button')?.focus();
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(openRightFind).toHaveBeenCalledTimes(1);

    document.body.innerHTML = '<section class="left-editor-pane"><button>raw</button></section>';
    document.querySelector('button')?.focus();
    fireEvent.keyDown(window, { key: 'f', altKey: true });
    expect(openLeftFind).toHaveBeenCalledTimes(2);
  });

  it('subscribes desktop find shortcuts to the focused pane handler', () => {
    const openLeftFind = vi.fn();
    const openRightFind = vi.fn();
    let findShortcut: (() => void) | undefined;
    const unsubscribe = vi.fn();
    window.electronAPI = {
      appendLog: vi.fn(),
      readRecentLog: vi.fn(),
      clearLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText: vi.fn(),
      openJsonFile: vi.fn(),
      onFindShortcut: vi.fn((callback) => {
        findShortcut = callback;
        return unsubscribe;
      }),
    };

    const { unmount } = renderHook(() => useContextualFindShortcut({ openLeftFind, openRightFind }));

    findShortcut?.();
    expect(openRightFind).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
