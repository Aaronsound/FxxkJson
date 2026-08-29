import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from '../utils/i18n';
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
    onOpenCompare: vi.fn(),
    onOpenDiagnosticsLog: vi.fn(),
    onOpenAbout: vi.fn(),
    onFoldAll: vi.fn(),
    onUnfoldAll: vi.fn(),
    canControlRightPaneFolding: true,
    isLargeFileMode: false,
    canEditJson: true,
    canCompareJson: true,
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
    accentTheme: 'emerald',
    onAccentThemeChange: vi.fn(),
    language: 'zh',
    onLanguageChange: vi.fn(),
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
    vi.unstubAllGlobals();
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

  it('keeps custom checkbox visuals aligned without changing checkbox behavior', () => {
    const { props } = renderToolbar();

    expect(document.querySelectorAll('.toolbar-checkbox-control')).toHaveLength(3);
    fireEvent.click(screen.getByRole('checkbox', { name: '自动换行' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '显示性能面板' }));

    expect(props.onWrapLongLinesChange).toHaveBeenCalledWith(true);
    expect(props.onShowPerformancePanelChange).toHaveBeenCalledWith(true);
  });

  it('opens the about dialog from the toolbar', () => {
    const { props } = renderToolbar();

    fireEvent.click(screen.getByText('更多'));
    fireEvent.click(screen.getByRole('button', { name: '关于' }));

    expect(props.onOpenAbout).toHaveBeenCalledTimes(1);
  });

  it('keeps About as the final item in the more menu', () => {
    renderToolbar();

    fireEvent.click(screen.getByText('更多'));
    const menu = document.querySelector('.toolbar-more-popover');
    expect(menu).not.toBeNull();
    if (!menu) throw new Error('更多菜单未渲染');

    const items = within(menu as HTMLElement).getAllByRole('button');
    expect(items.at(-1)).toHaveTextContent('关于');
  });

  it('keeps low-frequency appearance actions in the more menu', () => {
    const { props } = renderToolbar();

    expect(screen.getByText('更多')).toBeInTheDocument();
    fireEvent.click(screen.getByText('更多'));
    fireEvent.click(screen.getByRole('button', { name: '深色模式' }));
    fireEvent.click(screen.getByText('更多'));
    fireEvent.click(screen.getByText('语言'));
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));

    expect(props.onToggleDarkMode).toHaveBeenCalledTimes(1);
    expect(props.onLanguageChange).toHaveBeenCalledWith('en');
  });

  it('shows explicit language choices and marks the current language', () => {
    const { rerender, props } = renderToolbar();

    fireEvent.click(screen.getByText('更多'));
    fireEvent.click(screen.getByText('语言'));
    expect(screen.getByRole('radio', { name: '简体中文' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();

    rerender(<JsonToolToolbar {...props} language="en" t={createTranslator('en')} />);
    fireEvent.click(screen.getByText('More'));
    fireEvent.click(screen.getByText('Language'));
    expect(screen.getByRole('radio', { name: 'Chinese (简体中文)' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  });

  it('offers seven named accent themes and marks the current theme', () => {
    const { props, rerender } = renderToolbar();

    fireEvent.click(screen.getByText('更多'));
    fireEvent.click(screen.getByText('主题色'));
    const themeOptions = document.querySelector('.toolbar-theme-options');
    expect(themeOptions).not.toBeNull();
    if (!themeOptions) throw new Error('主题色选项未渲染');
    expect(within(themeOptions as HTMLElement).getAllByRole('radio')).toHaveLength(7);
    expect(screen.getByRole('radio', { name: '翡翠绿' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '雾蓝' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '石墨灰' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '曜石黑' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '靛青' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '雾蓝' }));
    expect(props.onAccentThemeChange).toHaveBeenCalledWith('mist');

    rerender(<JsonToolToolbar {...props} accentTheme="graphite" />);
    fireEvent.click(screen.getByText('更多'));
    fireEvent.click(screen.getByText('主题色'));
    expect(screen.getByRole('radio', { name: '石墨灰' })).toBeChecked();
  });

  it('closes the more menu on Escape and outside pointer interaction', () => {
    renderToolbar();
    const trigger = screen.getByText('更多');
    const menu = trigger.closest('details');

    fireEvent.click(trigger);
    expect(menu).toHaveAttribute('open');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(menu).not.toHaveAttribute('open');
    expect(trigger.closest('summary')).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(menu).not.toHaveAttribute('open');
  });

  it('moves secondary and document actions into More on compact windows', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
    const { props } = renderToolbar();

    fireEvent.click(screen.getByText('更多'));
    const compactActions = document.querySelector('.toolbar-more-compact-actions');
    expect(compactActions).not.toBeNull();
    if (!compactActions) throw new Error('窄窗口操作区未渲染');
    expect(within(compactActions as HTMLElement).getByText('内容处理')).toBeInTheDocument();
    expect(within(compactActions as HTMLElement).getByText('文档操作')).toBeInTheDocument();
    expect(screen.queryByText('设置与帮助')).not.toBeInTheDocument();
    expect(within(compactActions as HTMLElement).getAllByRole('button')).toHaveLength(7);
    const editButton = within(compactActions as HTMLElement).getByRole('button', { name: '编辑 JSON' });
    expect(editButton).not.toBeDisabled();
    fireEvent.click(editButton);
    expect(props.onEditJson).toHaveBeenCalledTimes(1);
  });

  it('updates compact actions when a window resize arrives without a media-query change event', () => {
    const mediaQuery = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQuery));
    renderToolbar();

    expect(document.querySelector('.toolbar-more-compact-actions')).toBeNull();
    mediaQuery.matches = true;
    fireEvent.resize(window);

    expect(document.querySelector('.toolbar-more-compact-actions')).not.toBeNull();
  });

  it('shows processing and large-file guidance in a readable status region', () => {
    const processingStageText = '正在构建大文件查看模式...';
    renderToolbar({
      processingStageText,
      isLargeFileMode: true,
      isLargeFileLocateEnabled: false,
    });

    const status = screen.getByRole('status', { name: '当前状态' });
    expect(status).toHaveTextContent(processingStageText);
    expect(status).toHaveTextContent('大文件轻量模式已开启');
    expect(screen.getByTitle(processingStageText)).toBeInTheDocument();
  });

  it('opens JSON compare from the toolbar', () => {
    const { props } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: '对比 JSON' }));

    expect(props.onOpenCompare).toHaveBeenCalledTimes(1);
  });

  it('offers diagnostics next to visible errors', () => {
    const { props } = renderToolbar({ currentError: 'JSON worker 加载失败' });

    const alert = screen.getByRole('alert', { name: '当前状态' });
    expect(alert).toHaveTextContent('JSON worker 加载失败');
    expect(screen.getByTitle('JSON worker 加载失败')).toBeInTheDocument();

    const diagnosticsButtons = screen.getAllByRole('button', { name: '诊断日志' });
    const diagnosticsButton = diagnosticsButtons.at(-1);
    expect(diagnosticsButton).toBeDefined();
    if (!diagnosticsButton) {
      throw new Error('诊断日志按钮未渲染');
    }
    fireEvent.click(diagnosticsButton);

    expect(props.onOpenDiagnosticsLog).toHaveBeenCalledTimes(1);
  });
});
