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

    renderHook(() =>
      useContextualFindShortcut({
        closeLeftFind: vi.fn(),
        closeRightFind: vi.fn(),
        isLeftFindOpen: false,
        isRightFindOpen: false,
        openLeftFind,
        openRightFind,
      })
    );

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

  it('closes the search belonging to the active pane when both searches are open', () => {
    const closeLeftFind = vi.fn();
    const closeRightFind = vi.fn();

    renderHook(() =>
      useContextualFindShortcut({
        closeLeftFind,
        closeRightFind,
        isLeftFindOpen: true,
        isRightFindOpen: true,
        openLeftFind: vi.fn(),
        openRightFind: vi.fn(),
      })
    );

    document.body.innerHTML = `
      <section class="left-editor-pane"><button id="left">raw</button></section>
      <section class="right-editor-pane"><button id="right">formatted</button></section>
    `;

    document.querySelector<HTMLElement>('#left')?.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeLeftFind).toHaveBeenCalledTimes(1);
    expect(closeRightFind).not.toHaveBeenCalled();

    document.querySelector<HTMLElement>('#right')?.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeRightFind).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape inside the search widget to its local handler', () => {
    const closeLeftFind = vi.fn();
    document.body.innerHTML =
      '<section class="left-editor-pane"><div class="pane-find-widget"><input /></div></section>';

    renderHook(() =>
      useContextualFindShortcut({
        closeLeftFind,
        closeRightFind: vi.fn(),
        isLeftFindOpen: true,
        isRightFindOpen: false,
        openLeftFind: vi.fn(),
        openRightFind: vi.fn(),
      })
    );

    const input = document.querySelector('input');
    input?.focus();
    fireEvent.keyDown(input ?? window, { key: 'Escape' });
    expect(closeLeftFind).not.toHaveBeenCalled();
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

    const { unmount } = renderHook(() =>
      useContextualFindShortcut({
        closeLeftFind: vi.fn(),
        closeRightFind: vi.fn(),
        isLeftFindOpen: false,
        isRightFindOpen: false,
        openLeftFind,
        openRightFind,
      })
    );

    findShortcut?.();
    expect(openRightFind).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
