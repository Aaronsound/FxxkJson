import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AboutDialog from './AboutDialog';

describe('AboutDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows app metadata and closes from the dialog action', () => {
    const onClose = vi.fn();

    render(<AboutDialog version="v1.0.19" isDarkMode={false} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: '关于 FuckJson' })).toBeInTheDocument();
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('FuckJson')).toBeInTheDocument();
    expect(screen.getByText('v1.0.19')).toBeInTheDocument();
    expect(screen.getByText('Alosan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'hanwalter@163.com' })).toHaveAttribute(
      'href',
      'mailto:hanwalter@163.com'
    );
    expect(screen.getByText(/支持大 JSON 导入/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
