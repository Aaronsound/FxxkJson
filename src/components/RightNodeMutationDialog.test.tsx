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
        state={{ mode: 'delete', pathText: '$.items[0]', preview: '{"name":"demo"}' }}
        isDarkMode={false}
        onCancel={vi.fn()}
        onConfirmDelete={onConfirmDelete}
        onConfirmRename={vi.fn()}
      />
    );

    expect(screen.getByText('$.items[0]')).toBeInTheDocument();
    expect(screen.getByText('{"name":"demo"}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it('cancels delete with Escape', () => {
    const onCancel = vi.fn();

    render(
      <RightNodeMutationDialog
        state={{ mode: 'delete', pathText: '$.items[0]', preview: 'true' }}
        isDarkMode={false}
        onCancel={onCancel}
        onConfirmDelete={vi.fn()}
        onConfirmRename={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
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

    expect(screen.getByText(/已有同名 key/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认重命名' }));

    expect(onConfirmRename).toHaveBeenCalledWith('displayName');
  });

  it('warns when renamed keys include outer whitespace', () => {
    render(
      <RightNodeMutationDialog
        state={{ mode: 'rename', currentKey: 'name', pathText: '$.name' }}
        isDarkMode={false}
        onCancel={vi.fn()}
        onConfirmDelete={vi.fn()}
        onConfirmRename={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: '新的 key 名称' }), {
      target: { value: ' displayName ' },
    });

    expect(screen.getByText(/首尾空格/)).toBeInTheDocument();
  });
});
