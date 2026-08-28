import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContextMenuSurface from './ContextMenuSurface';

describe('ContextMenuSurface', () => {
  afterEach(cleanup);

  it('focuses enabled items and supports menu keyboard navigation', () => {
    render(
      <ContextMenuSurface ariaLabel="Test menu" isDarkMode={false} onClose={vi.fn()} style={{ left: 0, top: 0 }}>
        <button type="button" role="menuitem" disabled>
          Disabled
        </button>
        <button type="button" role="menuitem">
          First
        </button>
        <button type="button" role="menuitem">
          Second
        </button>
      </ContextMenuSurface>
    );

    const menu = screen.getByRole('menu', { name: 'Test menu' });
    const first = screen.getByRole('menuitem', { name: 'First' });
    const second = screen.getByRole('menuitem', { name: 'Second' });

    expect(first).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(first).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <ContextMenuSurface ariaLabel="Test menu" isDarkMode={false} onClose={onClose} style={{ left: 0, top: 0 }}>
        <button type="button" role="menuitem">
          First
        </button>
      </ContextMenuSurface>
    );

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
