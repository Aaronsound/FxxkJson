import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LargeJsonContextMenu from './LargeJsonContextMenu';

const baseProps = {
  contextMenu: { x: 10, y: 20, offset: 42, foldLine: 3, parentFoldLine: 1 },
  isCollapsed: false,
  isParentCollapsed: false,
  isDarkMode: false,
  onClose: vi.fn(),
  onToggleFold: vi.fn(),
  onCopyPath: vi.fn(),
  onCopyKey: vi.fn(),
  onCopyValue: vi.fn(),
  onCopyCompactJson: vi.fn(),
  onCopyFormattedJson: vi.fn(),
  onEditValue: vi.fn(),
  onDeleteValue: vi.fn(),
  onRenameKey: vi.fn(),
  onUnescapeValue: vi.fn(),
};

describe('LargeJsonContextMenu', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('toggles current and parent fold lines and closes', () => {
    render(<LargeJsonContextMenu {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '收缩当前节点' }));
    fireEvent.click(screen.getByRole('button', { name: '收缩所属层级' }));

    expect(baseProps.onToggleFold).toHaveBeenNthCalledWith(1, 3);
    expect(baseProps.onToggleFold).toHaveBeenNthCalledWith(2, 1);
    expect(baseProps.onClose).toHaveBeenCalledTimes(2);
  });

  it('shows only the parent fold action for scalar rows', () => {
    render(<LargeJsonContextMenu {...baseProps} contextMenu={{ ...baseProps.contextMenu, foldLine: null }} />);

    expect(screen.queryByRole('button', { name: '收缩当前节点' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收缩所属层级' }));

    expect(baseProps.onToggleFold).toHaveBeenCalledWith(1);
  });

  it('runs node actions with the context offset', async () => {
    render(<LargeJsonContextMenu {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '重命名 key' }));

    expect(baseProps.onRenameKey).toHaveBeenCalledWith(42);
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalledTimes(1));
  });
});
