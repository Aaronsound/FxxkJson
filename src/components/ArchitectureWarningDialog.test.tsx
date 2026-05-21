import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArchitectureWarningDialog from './ArchitectureWarningDialog';

describe('ArchitectureWarningDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('explains the Rosetta performance risk and exposes both actions', () => {
    const onClose = vi.fn();
    const onOpenAbout = vi.fn();

    render(<ArchitectureWarningDialog isDarkMode={false} onClose={onClose} onOpenAbout={onOpenAbout} />);

    expect(screen.getByRole('dialog', { name: '检测到 x64 版本正在转译运行' })).toBeInTheDocument();
    expect(screen.getByText(/macos-arm64/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看关于' }));
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));

    expect(onOpenAbout).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
