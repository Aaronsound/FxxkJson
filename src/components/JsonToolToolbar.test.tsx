import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonToolToolbar from './JsonToolToolbar';

function renderToolbar(overrides: Partial<React.ComponentProps<typeof JsonToolToolbar>> = {}) {
  const props: React.ComponentProps<typeof JsonToolToolbar> = {
    onImport: vi.fn(),
    onFormat: vi.fn(),
    onRepairJson: vi.fn(),
    onUnescapeJson: vi.fn(),
    onEscapeJson: vi.fn(),
    onClear: vi.fn(),
    onEditJson: vi.fn(),
    onOpenDiagnosticsLog: vi.fn(),
    onFoldAll: vi.fn(),
    onUnfoldAll: vi.fn(),
    canControlRightPaneFolding: true,
    isLargeFileMode: false,
    canEditJson: true,
    wrapLongLines: false,
    onWrapLongLinesChange: vi.fn(),
    isDarkMode: false,
    onToggleDarkMode: vi.fn(),
    isLargeFileLocateEnabled: false,
    onLargeFileLocateToggle: vi.fn(),
    showPerformancePanel: false,
    onShowPerformancePanelChange: vi.fn(),
    importingFileName: null,
    canEnableLargeFileLocate: true,
    usesLightweightLocate: false,
    currentStructureStatus: 'ready',
    processingStageText: null,
    currentError: null,
    ...overrides,
  };

  return {
    ...render(<JsonToolToolbar {...props} />),
    props,
  };
}

describe('JsonToolToolbar', () => {
  afterEach(() => {
    cleanup();
  });

  it('calls JSON escape transform actions', () => {
    const { props } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: '反转义' }));
    fireEvent.click(screen.getByRole('button', { name: '转义' }));

    expect(props.onUnescapeJson).toHaveBeenCalledTimes(1);
    expect(props.onEscapeJson).toHaveBeenCalledTimes(1);
  });

  it('disables JSON escape transform actions without editable content', () => {
    const { props } = renderToolbar({ canEditJson: false });
    const unescapeButton = screen.getByRole('button', { name: '反转义' });
    const escapeButton = screen.getByRole('button', { name: '转义' });

    expect(unescapeButton).toBeDisabled();
    expect(escapeButton).toBeDisabled();

    fireEvent.click(unescapeButton);
    fireEvent.click(escapeButton);

    expect(props.onUnescapeJson).not.toHaveBeenCalled();
    expect(props.onEscapeJson).not.toHaveBeenCalled();
  });
});
