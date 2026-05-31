import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RightEditorContextMenu from './RightEditorContextMenu';

const baseProps = {
  contextMenu: { x: 12, y: 34, tabId: 'tab-1', offset: 56, hasCurrentFoldTarget: true, hasParentFoldTarget: true },
  isDarkMode: false,
  onClose: vi.fn(),
  onToggleFold: vi.fn(),
  onCopyPath: vi.fn(),
  onCopyKey: vi.fn(),
  onCopyValue: vi.fn(),
  onCopyCompactJson: vi.fn(),
  onCopyFormattedJson: vi.fn(),
  onEditValue: vi.fn(),
  onRenameKey: vi.fn(),
  onDeleteValue: vi.fn(),
  onUnescapeValue: vi.fn(),
};

describe('RightEditorContextMenu', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('toggles current and parent folding with the active tab and offset', () => {
    render(<RightEditorContextMenu {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '展开/收缩当前节点' }));
    fireEvent.click(screen.getByRole('button', { name: '展开/收缩所属层级' }));

    expect(baseProps.onClose).toHaveBeenCalledTimes(2);
    expect(baseProps.onToggleFold).toHaveBeenNthCalledWith(1, 'tab-1', 56, 'current');
    expect(baseProps.onToggleFold).toHaveBeenNthCalledWith(2, 'tab-1', 56, 'parent');
  });

  it('only shows the parent fold action for scalar fields', () => {
    render(
      <RightEditorContextMenu
        {...baseProps}
        contextMenu={{ ...baseProps.contextMenu, hasCurrentFoldTarget: false, hasParentFoldTarget: true }}
      />
    );

    expect(screen.queryByRole('button', { name: '展开/收缩当前节点' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开/收缩所属层级' }));

    expect(baseProps.onToggleFold).toHaveBeenCalledWith('tab-1', 56, 'parent');
  });

  it('runs node actions with the active tab and offset', async () => {
    render(<RightEditorContextMenu {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '重命名 key' }));

    expect(baseProps.onRenameKey).toHaveBeenCalledWith('tab-1', 56);
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalledTimes(1));
  });

  it('positions the menu at the provided viewport coordinates', () => {
    render(<RightEditorContextMenu {...baseProps} />);

    const menu = document.querySelector<HTMLElement>('.large-json-context-menu');
    expect(menu?.style.left).toBe('12px');
    expect(menu?.style.top).toBe('34px');
  });
});
