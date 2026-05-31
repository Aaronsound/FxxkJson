import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LeftEditorContextMenu from './LeftEditorContextMenu';

const baseProps = {
  contextMenu: { x: 24, y: 48, hasSelection: true },
  isDarkMode: false,
  onClose: vi.fn(),
  onCopy: vi.fn(),
  onCut: vi.fn(),
  onPaste: vi.fn(),
  onSelectAll: vi.fn(),
};

describe('LeftEditorContextMenu', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('runs paste and closes the menu', async () => {
    render(<LeftEditorContextMenu {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '粘贴' }));

    expect(baseProps.onPaste).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalledTimes(1));
  });

  it('disables copy and cut without a selection', () => {
    render(<LeftEditorContextMenu {...baseProps} contextMenu={{ x: 24, y: 48, hasSelection: false }} />);

    expect(screen.getByRole('button', { name: '复制' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '剪切' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '全选' })).not.toBeDisabled();
  });

  it('positions the menu at the provided viewport coordinates', () => {
    render(<LeftEditorContextMenu {...baseProps} />);

    const menu = document.querySelector<HTMLElement>('.large-json-context-menu');
    expect(menu?.style.left).toBe('24px');
    expect(menu?.style.top).toBe('48px');
  });
});
