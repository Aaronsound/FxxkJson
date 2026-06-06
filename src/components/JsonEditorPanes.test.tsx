import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import JsonEditorPanes from './JsonEditorPanes';
import type { LeftPaneProps, RightPaneProps } from './JsonEditorPanes';

vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-editor" />,
}));

describe('JsonEditorPanes', () => {
  it('shows left search and replace controls for the dedicated raw viewer', () => {
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
      activeLargeViewerCollapsedLines: [],
      activeLargeViewerData: null,
      activeRightMatchCount: 0,
      formattedValue: '',
      isBuildingDedicatedRightViewer: false,
      isDarkMode: false,
      isFormattingActiveTab: false,
      isImportingActiveTab: false,
      isLargeFileMode: true,
      isRightFindOpen: false,
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
      onRightCollapsedLinesChange: noOp,
      onRightMatchCountChange: noOp,
      onRightMount: noOp,
      onRightSearchOptionsChange: noOp,
      onRightSearchTermChange: noOp,
      onSelectRightPinnedPath: noOp,
      onSelectRightRecentSearch: noOp,
      onUnescapeRightValue: noOp,
    };

    render(<JsonEditorPanes isDarkMode={false} leftPaneProps={leftPaneProps} rightPaneProps={rightPaneProps} />);

    expect(screen.getByPlaceholderText('搜索原始 JSON')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('替换为')).toBeInTheDocument();
  });
});
