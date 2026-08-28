import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import { createTranslator } from '../utils/i18n';
import type { LeftPaneProps, RightPaneProps } from './JsonEditorPanes';
import JsonEditorPanes from './JsonEditorPanes';

vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-editor" />,
}));

describe('JsonEditorPanes', () => {
  it('keeps pane search widgets in the layout above editor content', () => {
    const noOp = vi.fn();
    const leftPaneProps: LeftPaneProps = {
      activeLargeRawViewerData: null,
      activeLeftMatchCount: 0,
      activeRawText: '{"name":"large"}',
      isDarkMode: false,
      isLargeFileMode: true,
      isLeftFindOpen: true,
      isLeftSearchLoadingMore: false,
      largeRawViewerRef: { current: null },
      leftPaneMetaText: '',
      leftRawHighlightRange: null,
      leftReplaceText: '',
      leftSearchHasMore: false,
      leftSearchOptions: DEFAULT_SEARCH_OPTIONS,
      leftSearchTerm: '',
      normalizedLeftMatchIndex: 0,
      processingStageText: null,
      shouldShowLeftPlaceholder: false,
      shouldUseDedicatedLeftViewer: true,
      wrapLongLines: false,
      onCloseLeftFind: noOp,
      onLeftChange: noOp,
      onLeftMount: noOp,
      onLeftReplace: noOp,
      onLeftReplaceAll: noOp,
      onLeftReplaceValueChange: noOp,
      onLeftSearchOptionsChange: noOp,
      onLeftSearchTermChange: noOp,
      onLoadMoreLeftSearch: noOp,
      onNextLeft: noOp,
      onPrevLeft: noOp,
    };
    const rightPaneProps: RightPaneProps = {
      activeLargeViewerFoldState: { mode: 'explicit', lines: [] },
      activeLargeViewerData: null,
      activeRightMatchCount: 0,
      formattedValue: '',
      isBuildingDedicatedRightViewer: false,
      isDarkMode: false,
      isFormattingActiveTab: false,
      isImportingActiveTab: false,
      isLargeFileMode: true,
      isRightFindOpen: true,
      isRightSearchLoadingMore: false,
      largeViewerMatches: [],
      largeViewerRef: { current: null },
      normalizedRightMatchIndex: 0,
      processingStageText: null,
      rightMatchIndex: 0,
      rightPaneMetaText: '',
      rightPinnedPaths: [],
      rightRecentSearches: [],
      rightSearchHasMore: false,
      rightSearchOptions: DEFAULT_SEARCH_OPTIONS,
      rightSearchTerm: '',
      rightSelectedRange: null,
      shouldEnableRightPaneFolding: true,
      shouldUseDedicatedRightViewer: false,
      wrapLongLines: false,
      onCloseRightFind: noOp,
      onCopyRightCompactJson: noOp,
      onCopyRightFormattedJson: noOp,
      onCopyRightKey: noOp,
      onCopyRightPath: noOp,
      onCopyRightValue: noOp,
      onDeleteRightValue: noOp,
      onEditRightValue: noOp,
      onLoadMoreRightSearch: noOp,
      onLocateRightOffset: noOp,
      onNextRight: noOp,
      onOpenRightFind: noOp,
      onPinCurrentRightPath: noOp,
      onPrevRight: noOp,
      onRenameRightKey: noOp,
      onRightFoldStateChange: noOp,
      onRightMatchCountChange: noOp,
      onRightMount: noOp,
      onRightSearchOptionsChange: noOp,
      onRightSearchTermChange: noOp,
      onSelectRightPinnedPath: noOp,
      onSelectRightRecentSearch: noOp,
      onUnescapeRightValue: noOp,
    };

    const { rerender } = render(
      <JsonEditorPanes isDarkMode={false} leftPaneProps={leftPaneProps} rightPaneProps={rightPaneProps} />
    );

    expect(screen.getByText('原始 JSON')).toBeInTheDocument();
    expect(screen.getAllByText('格式化结果')).toHaveLength(2);
    expect(screen.getByPlaceholderText('搜索原始 JSON')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('替换为')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索原始 JSON').closest('.editor-pane-body')).toHaveClass('pane-find-open');
    expect(screen.getByPlaceholderText('搜索格式化结果').closest('.editor-pane-body')).toHaveClass('pane-find-open');
    expect(document.querySelector('.left-editor-pane')).toHaveStyle({ flex: '0 1 auto', minWidth: 0 });
    expect(document.querySelector('.right-editor-pane')).toHaveStyle({ flex: '0 1 auto', minWidth: 0 });
    expect(document.querySelector('.gutter.gutter-horizontal')).toHaveStyle({ width: '10px' });

    rerender(
      <JsonEditorPanes
        isDarkMode={false}
        leftPaneProps={{ ...leftPaneProps, activeRawText: '', isLeftFindOpen: false, shouldShowLeftPlaceholder: true }}
        rightPaneProps={{ ...rightPaneProps, isRightFindOpen: false }}
      />
    );
    expect(screen.getByText('直接输入或粘贴 JSON（⌘V / Ctrl+V），也可以把 JSON 文件拖到窗口中。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导入文件' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '粘贴 JSON' })).not.toBeInTheDocument();

    rerender(
      <JsonEditorPanes
        isDarkMode={false}
        leftPaneProps={leftPaneProps}
        rightPaneProps={rightPaneProps}
        t={createTranslator('en')}
      />
    );
    expect(screen.getByText('Raw JSON')).toBeInTheDocument();
    expect(screen.getAllByText('Formatted result')).toHaveLength(2);
    expect(screen.getByPlaceholderText('Search raw JSON')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search formatted result')).toBeInTheDocument();
  });
});
