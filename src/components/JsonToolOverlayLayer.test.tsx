import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonToolOverlayLayer from './JsonToolOverlayLayer';

vi.mock('./AboutDialog', () => ({ default: () => <div data-testid="about-dialog" /> }));
vi.mock('./DiagnosticsLogPanel', () => ({ default: () => <div data-testid="diagnostics-dialog" /> }));
vi.mock('./JsonCompareDialog', () => ({ default: () => <div data-testid="compare-dialog" /> }));
vi.mock('./JsonEditModal', () => ({ default: () => <div data-testid="edit-dialog" /> }));
vi.mock('./RightNodeMutationDialog', () => ({ default: () => <div data-testid="mutation-dialog" /> }));

type OverlayProps = ComponentProps<typeof JsonToolOverlayLayer>;

function createProps(overrides: Partial<OverlayProps> = {}): OverlayProps {
  return {
    activeTabId: 'tab-a',
    diagnosticsContext: {} as OverlayProps['diagnosticsContext'],
    editJsonBusyLabel: null,
    editJsonError: null,
    editJsonSession: null,
    getTabText: vi.fn(() => '{}'),
    hasCopiedLiteral: false,
    isAboutOpen: false,
    isArchitectureWarningDismissed: true,
    isCompareOpen: false,
    isDarkMode: false,
    isDiagnosticsLogOpen: false,
    isDragImportActive: false,
    onCancelMutationDialog: vi.fn(),
    onCloseAbout: vi.fn(),
    onCloseCompare: vi.fn(),
    onCloseDiagnosticsLog: vi.fn(),
    onCloseEditJson: vi.fn(),
    onConfirmDeleteMutationDialog: vi.fn(),
    onConfirmRenameMutationDialog: vi.fn(),
    onCopyEscapedJson: vi.fn(),
    onDismissArchitectureWarning: vi.fn(),
    onEditJsonValueChange: vi.fn(),
    onEscapeEditJsonContent: vi.fn(async (value: string) => value),
    onOpenAbout: vi.fn(),
    onSaveEditJson: vi.fn(),
    onUnescapeEditJsonContent: vi.fn(async (value: string) => value),
    rightNodeMutationDialog: null,
    runtimeInfo: null,
    tabs: [{ id: 'tab-a', title: 'newTab' }],
    t: ((key: string) => key) as OverlayProps['t'],
    version: '1.0.33',
    ...overrides,
  };
}

describe('JsonToolOverlayLayer', () => {
  afterEach(() => {
    cleanup();
  });

  it('mounts lazy dialogs only when their corresponding state opens', async () => {
    const props = createProps();
    const { rerender } = render(<JsonToolOverlayLayer {...props} />);

    expect(screen.queryByTestId('about-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diagnostics-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('compare-dialog')).not.toBeInTheDocument();

    rerender(<JsonToolOverlayLayer {...props} isCompareOpen />);
    expect(await screen.findByTestId('compare-dialog')).toBeInTheDocument();

    rerender(<JsonToolOverlayLayer {...props} isDiagnosticsLogOpen />);
    expect(await screen.findByTestId('diagnostics-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('compare-dialog')).not.toBeInTheDocument();

    rerender(<JsonToolOverlayLayer {...props} isAboutOpen />);
    expect(await screen.findByTestId('about-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostics-dialog')).not.toBeInTheDocument();
  });

  it('keeps drag import feedback independent from dialog loading', () => {
    render(<JsonToolOverlayLayer {...createProps({ isDragImportActive: true })} />);

    expect(screen.getByText('drag.title')).toBeInTheDocument();
    expect(screen.getByText('drag.subtitle')).toBeInTheDocument();
    expect(screen.queryByTestId('about-dialog')).not.toBeInTheDocument();
  });
});
