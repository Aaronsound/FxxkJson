import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RightNodeMutationDialog from './RightNodeMutationDialog';

describe('RightNodeMutationDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('confirms node deletion without using a browser confirm prompt', () => {
    const onConfirmDelete = vi.fn();

    render(
      <RightNodeMutationDialog
        state={{ mode: 'delete', pathText: '$.items[0]' }}
        isDarkMode={false}
        onCancel={vi.fn()}
        onConfirmDelete={onConfirmDelete}
        onConfirmRename={vi.fn()}
      />
    );

    expect(screen.getByText('$.items[0]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it('submits a renamed object key', () => {
    const onConfirmRename = vi.fn();

    render(
      <RightNodeMutationDialog
        state={{ mode: 'rename', currentKey: 'name', pathText: '$.name' }}
        isDarkMode={false}
        onCancel={vi.fn()}
        onConfirmDelete={vi.fn()}
        onConfirmRename={onConfirmRename}
      />
    );

    const input = screen.getByRole('textbox', { name: '新的 key 名称' });
    fireEvent.change(input, { target: { value: 'displayName' } });
    fireEvent.click(screen.getByRole('button', { name: '确认重命名' }));

    expect(onConfirmRename).toHaveBeenCalledWith('displayName');
  });
});
