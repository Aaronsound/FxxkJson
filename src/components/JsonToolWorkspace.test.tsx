import { fireEvent, render, screen } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import JsonToolWorkspace from './JsonToolWorkspace';

vi.mock('./JsonEditorPanes', () => ({ default: () => <div data-testid="editor-panes" /> }));
vi.mock('./JsonPerformancePanel', () => ({ default: () => <div data-testid="performance-panel" /> }));
vi.mock('./JsonToolContextMenus', () => ({ default: () => <div data-testid="context-menus" /> }));
vi.mock('./JsonToolOverlayLayer', () => ({ default: () => <div data-testid="overlay-layer" /> }));
vi.mock('./JsonToolTabBar', () => ({ default: () => <div data-testid="tab-bar" /> }));
vi.mock('./JsonToolToolbar', () => ({
  default: () => <div data-testid="toolbar" />,
  JsonToolToolbarFeedback: () => <div data-testid="toolbar-feedback" />,
}));

type WorkspaceProps = ComponentProps<typeof JsonToolWorkspace>;

function createProps(overrides: Partial<WorkspaceProps> = {}): WorkspaceProps {
  return {
    contextMenusProps: {} as WorkspaceProps['contextMenusProps'],
    fileInputRef: createRef<HTMLInputElement>(),
    isDarkMode: false,
    onDragEnter: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onFileSelection: vi.fn(),
    overlayProps: {} as WorkspaceProps['overlayProps'],
    panesProps: {} as WorkspaceProps['panesProps'],
    performancePanelProps: {} as WorkspaceProps['performancePanelProps'],
    shouldShowPerformancePanel: false,
    tabBarProps: {} as WorkspaceProps['tabBarProps'],
    toolbarProps: {} as WorkspaceProps['toolbarProps'],
    ...overrides,
  };
}

describe('JsonToolWorkspace', () => {
  it('composes the workspace and mounts the performance panel only when enabled', () => {
    const props = createProps();
    const { rerender } = render(<JsonToolWorkspace {...props} />);

    expect(screen.getByTestId('overlay-layer')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
    expect(screen.getByTestId('editor-panes')).toBeInTheDocument();
    expect(screen.getByTestId('context-menus')).toBeInTheDocument();
    expect(screen.queryByTestId('performance-panel')).not.toBeInTheDocument();

    rerender(<JsonToolWorkspace {...props} shouldShowPerformancePanel />);
    expect(screen.getByTestId('performance-panel')).toBeInTheDocument();
  });

  it('keeps native file selection and workspace drop events connected', () => {
    const onDrop = vi.fn();
    const onFileSelection = vi.fn();
    const { container } = render(<JsonToolWorkspace {...createProps({ onDrop, onFileSelection })} />);
    const workspace = container.querySelector('.app-container');
    const fileInput = container.querySelector('input[type="file"]');

    expect(workspace).not.toBeNull();
    expect(fileInput).not.toBeNull();
    fireEvent.drop(workspace as Element);
    fireEvent.change(fileInput as Element);

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onFileSelection).toHaveBeenCalledTimes(1);
  });
});
