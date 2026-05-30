import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RightEditorContextMenu from './RightEditorContextMenu';

const baseProps = {
  contextMenu: { x: 12, y: 34, tabId: 'tab-1', offset: 56 },
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

  it('toggles folding with the active tab and offset', () => {
    render(<RightEditorContextMenu {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '展开/收缩当前/所属节点' }));

    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
    expect(baseProps.onToggleFold).toHaveBeenCalledWith('tab-1', 56);
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
