import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import JsonEditorPanes from './JsonEditorPanes';

vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-editor" />,
}));

describe('JsonEditorPanes', () => {
  it('shows left search and replace controls for the dedicated raw viewer', () => {
    const noOp = vi.fn();

    render(
      <JsonEditorPanes
        activeLargeRawViewerData={null}
        activeLargeViewerCollapsedLines={[]}
        activeLargeViewerData={null}
        activeLeftMatchCount={0}
        activeRawText='{"name":"large"}'
        activeRightMatchCount={0}
        formattedValue=""
        isBuildingDedicatedRightViewer={false}
        isDarkMode={false}
        isFormattingActiveTab={false}
        isImportingActiveTab={false}
        isLargeFileMode
        isLeftFindOpen
        isRightFindOpen={false}
        largeRawViewerRef={{ current: null }}
        largeViewerMatches={[]}
        largeViewerRef={{ current: null }}
        leftPaneMetaText=""
        leftRawHighlightRange={null}
        leftReplaceText=""
        leftSearchHasMore={false}
        leftSearchOptions={DEFAULT_SEARCH_OPTIONS}
        leftSearchTerm=""
        normalizedLeftMatchIndex={0}
        normalizedRightMatchIndex={0}
        processingStageText={null}
        rightMatchIndex={0}
        rightPaneMetaText=""
        rightPinnedPaths={[]}
        rightRecentSearches={[]}
        rightSearchHasMore={false}
        rightSearchOptions={DEFAULT_SEARCH_OPTIONS}
        rightSearchTerm=""
        rightSelectedRange={null}
        shouldEnableRightPaneFolding
        shouldShowLeftPlaceholder={false}
        shouldUseDedicatedLeftViewer
        shouldUseDedicatedRightViewer={false}
        wrapLongLines={false}
        isLeftSearchLoadingMore={false}
        isRightSearchLoadingMore={false}
        onCloseLeftFind={noOp}
        onCloseRightFind={noOp}
        onCopyRightCompactJson={noOp}
        onCopyRightFormattedJson={noOp}
        onCopyRightKey={noOp}
        onCopyRightPath={noOp}
        onCopyRightValue={noOp}
        onDeleteRightValue={noOp}
        onEditRightValue={noOp}
        onLeftChange={noOp}
        onLeftMount={noOp}
        onLeftReplace={noOp}
        onLeftReplaceAll={noOp}
        onLeftReplaceValueChange={noOp}
        onLeftSearchOptionsChange={noOp}
        onLeftSearchTermChange={noOp}
        onLoadMoreLeftSearch={noOp}
        onLoadMoreRightSearch={noOp}
        onLocateRightOffset={noOp}
        onOpenRightFind={noOp}
        onPinCurrentRightPath={noOp}
        onPrevLeft={noOp}
        onPrevRight={noOp}
        onRenameRightKey={noOp}
        onSelectRightPinnedPath={noOp}
        onSelectRightRecentSearch={noOp}
        onUnescapeRightValue={noOp}
        onNextLeft={noOp}
        onNextRight={noOp}
        onRightCollapsedLinesChange={noOp}
        onRightMatchCountChange={noOp}
        onRightMount={noOp}
        onRightSearchOptionsChange={noOp}
        onRightSearchTermChange={noOp}
      />
    );

    expect(screen.getByPlaceholderText('搜索原始 JSON')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('替换为')).toBeInTheDocument();
  });
});
