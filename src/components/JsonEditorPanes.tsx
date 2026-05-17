import React from 'react';
import Split from 'react-split';
import Editor, { OnMount } from '@monaco-editor/react';
import LargeJsonReadonlyViewer, { LargeJsonReadonlyViewerHandle } from './LargeJsonReadonlyViewer';
import LargeRawReadonlyViewer, { LargeRawReadonlyViewerHandle } from './LargeRawReadonlyViewer';
import PaneFindWidget from './PaneFindWidget';
import type {
  JsonSearchOptions,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeRawViewerData,
} from '../types/jsonTool';
import { getMonacoOptions } from '../utils/jsonEditorInteractions';

interface JsonEditorPanesProps {
  activeLargeRawViewerData: LargeRawViewerData | null;
  activeLargeViewerCollapsedLines: number[];
  activeLargeViewerData: LargeJsonViewerData | null;
  activeLeftMatchCount: number;
  activeRawText: string;
  activeRightMatchCount: number;
  formattedValue: string;
  isBuildingDedicatedRightViewer: boolean;
  isDarkMode: boolean;
  isFormattingActiveTab: boolean;
  isImportingActiveTab: boolean;
  isLargeFileMode: boolean;
  isLeftFindOpen: boolean;
  isRightFindOpen: boolean;
  largeRawViewerRef: React.MutableRefObject<LargeRawReadonlyViewerHandle | null>;
  largeViewerMatches: LargeJsonSearchMatch[];
  largeViewerRef: React.MutableRefObject<LargeJsonReadonlyViewerHandle | null>;
  leftPaneMetaText: string;
  leftRawHighlightRange: { start: number; end: number } | null;
  leftReplaceText: string;
  leftSearchHasMore: boolean;
  leftSearchOptions: JsonSearchOptions;
  leftSearchTerm: string;
  normalizedLeftMatchIndex: number;
  normalizedRightMatchIndex: number;
  processingStageText: string | null;
  rightMatchIndex: number;
  rightPaneMetaText: string;
  rightSearchHasMore: boolean;
  rightSearchOptions: JsonSearchOptions;
  rightSelectedRange: { start: number; end: number } | null;
  rightSearchTerm: string;
  shouldEnableRightPaneFolding: boolean;
  shouldShowLeftPlaceholder: boolean;
  shouldUseDedicatedLeftViewer: boolean;
  shouldUseDedicatedRightViewer: boolean;
  wrapLongLines: boolean;
  isLeftSearchLoadingMore: boolean;
  isRightSearchLoadingMore: boolean;
  onCloseLeftFind: () => void;
  onCloseRightFind: () => void;
  onCopyRightValue: (offset: number) => void;
  onEditRightValue: (offset: number) => void;
  onLeftChange: (value?: string) => void;
  onLeftMount: OnMount;
  onLeftReplace: () => void;
  onLeftReplaceAll: () => void;
  onLeftReplaceValueChange: (value: string) => void;
  onLeftSearchOptionsChange: (options: JsonSearchOptions) => void;
  onLeftSearchTermChange: (value: string) => void;
  onLoadMoreLeftSearch: () => void;
  onLoadMoreRightSearch: () => void;
  onLocateRightOffset: (offset: number) => void;
  onOpenRightFind: () => void;
  onPrevLeft: () => void;
  onPrevRight: () => void;
  onUnescapeRightValue: (offset: number) => void;
  onNextLeft: () => void;
  onNextRight: () => void;
  onRightCollapsedLinesChange: (lines: number[]) => void;
  onRightMatchCountChange: (count: number) => void;
  onRightMount: OnMount;
  onRightSearchOptionsChange: (options: JsonSearchOptions) => void;
  onRightSearchTermChange: (value: string) => void;
}

const JsonEditorPanes: React.FC<JsonEditorPanesProps> = ({
  activeLargeRawViewerData,
  activeLargeViewerCollapsedLines,
  activeLargeViewerData,
  activeLeftMatchCount,
  activeRawText,
  activeRightMatchCount,
  formattedValue,
  isBuildingDedicatedRightViewer,
  isDarkMode,
  isFormattingActiveTab,
  isImportingActiveTab,
  isLargeFileMode,
  isLeftFindOpen,
  isRightFindOpen,
  largeRawViewerRef,
  largeViewerMatches,
  largeViewerRef,
  leftPaneMetaText,
  leftRawHighlightRange,
  leftReplaceText,
  leftSearchHasMore,
  leftSearchOptions,
  leftSearchTerm,
  normalizedLeftMatchIndex,
  normalizedRightMatchIndex,
  processingStageText,
  rightMatchIndex,
  rightPaneMetaText,
  rightSearchHasMore,
  rightSearchOptions,
  rightSelectedRange,
  rightSearchTerm,
  shouldEnableRightPaneFolding,
  shouldShowLeftPlaceholder,
  shouldUseDedicatedLeftViewer,
  shouldUseDedicatedRightViewer,
  wrapLongLines,
  isLeftSearchLoadingMore,
  isRightSearchLoadingMore,
  onCloseLeftFind,
  onCloseRightFind,
  onCopyRightValue,
  onEditRightValue,
  onLeftChange,
  onLeftMount,
  onLeftReplace,
  onLeftReplaceAll,
  onLeftReplaceValueChange,
  onLeftSearchOptionsChange,
  onLeftSearchTermChange,
  onLoadMoreLeftSearch,
  onLoadMoreRightSearch,
  onLocateRightOffset,
  onOpenRightFind,
  onPrevLeft,
  onPrevRight,
  onUnescapeRightValue,
  onNextLeft,
  onNextRight,
  onRightCollapsedLinesChange,
  onRightMatchCountChange,
  onRightMount,
  onRightSearchOptionsChange,
  onRightSearchTermChange,
}) => (
  <Split
    sizes={[50, 50]}
    minSize={200}
    gutterSize={6}
    style={{
      display: 'flex',
      flex: 1,
      minHeight: 0,
    }}
  >
    <div
      className="editor-pane left-editor-pane"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRight: isDarkMode ? '1px solid #444' : '1px solid #ddd',
        overflow: 'hidden',
        overscrollBehavior: 'contain',
      }}
    >
      <div className={`editor-pane-header editor-pane-header-subtle ${isDarkMode ? 'dark' : ''}`}>
        <span className="editor-pane-header-text">{leftPaneMetaText}</span>
      </div>
      <div className="editor-pane-body">
        {isLeftFindOpen && !shouldUseDedicatedLeftViewer && (
          <PaneFindWidget
            value={leftSearchTerm}
            currentIndex={activeLeftMatchCount > 0 ? normalizedLeftMatchIndex + 1 : 0}
            matchCount={activeLeftMatchCount}
            hasMore={leftSearchHasMore}
            isLoadingMore={isLeftSearchLoadingMore}
            isDarkMode={isDarkMode}
            placeholder="搜索原始 JSON"
            searchOptions={leftSearchOptions}
            canReplace
            replaceValue={leftReplaceText}
            onChange={onLeftSearchTermChange}
            onSearchOptionsChange={onLeftSearchOptionsChange}
            onReplaceValueChange={onLeftReplaceValueChange}
            onReplace={onLeftReplace}
            onReplaceAll={onLeftReplaceAll}
            onLoadMore={onLoadMoreLeftSearch}
            onPrev={onPrevLeft}
            onNext={onNextLeft}
            onClose={onCloseLeftFind}
          />
        )}
        {shouldUseDedicatedLeftViewer ? (
          <LargeRawReadonlyViewer
            ref={largeRawViewerRef}
            text={activeRawText}
            data={activeLargeRawViewerData}
            isDarkMode={isDarkMode}
            highlightRange={leftRawHighlightRange}
          />
        ) : (
          <Editor
            onMount={onLeftMount}
            theme={isDarkMode ? 'vs-dark' : 'vs-light'}
            options={getMonacoOptions({
              largeMode: isLargeFileMode,
              wrapLongLines,
            })}
            onChange={onLeftChange}
            height="100%"
            loading={null}
          />
        )}
        {shouldShowLeftPlaceholder && (
          <div className="editor-center-placeholder">原始 JSON</div>
        )}
        {processingStageText && (
          <div className="editor-loading-overlay">
            {processingStageText}
          </div>
        )}
      </div>
    </div>

    <div
      className="editor-pane right-editor-pane"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        overscrollBehavior: 'contain',
      }}
    >
      <div className={`editor-pane-header ${isDarkMode ? 'dark' : ''}`}>
        <span className="editor-pane-header-text">{rightPaneMetaText}</span>
        <div className="editor-pane-header-flags">
          <span className={`editor-pane-header-flag ${shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer ? 'visible' : ''}`}>
            轻量折叠模式
          </span>
          <span className={`editor-pane-header-flag ${isLargeFileMode ? 'visible' : ''}`}>
            轻量模式
          </span>
        </div>
      </div>
      <div className="editor-pane-body">
        {isRightFindOpen && (
          <PaneFindWidget
            value={rightSearchTerm}
            currentIndex={activeRightMatchCount > 0 ? normalizedRightMatchIndex + 1 : 0}
            matchCount={activeRightMatchCount}
            hasMore={rightSearchHasMore}
            isLoadingMore={isRightSearchLoadingMore}
            isDarkMode={isDarkMode}
            placeholder="搜索格式化结果"
            searchOptions={rightSearchOptions}
            onChange={onRightSearchTermChange}
            onSearchOptionsChange={onRightSearchOptionsChange}
            onLoadMore={onLoadMoreRightSearch}
            onPrev={onPrevRight}
            onNext={onNextRight}
            onClose={onCloseRightFind}
          />
        )}
        {shouldUseDedicatedRightViewer && activeLargeViewerData ? (
          <LargeJsonReadonlyViewer
            ref={largeViewerRef}
            text={formattedValue}
            data={activeLargeViewerData}
            isDarkMode={isDarkMode}
            wrapLongLines={wrapLongLines}
            collapsedLines={activeLargeViewerCollapsedLines}
            searchTerm={rightSearchTerm}
            searchOptions={rightSearchOptions}
            searchMatches={largeViewerMatches}
            activeMatchIndex={rightMatchIndex}
            selectedRange={rightSelectedRange}
            onCollapsedLinesChange={onRightCollapsedLinesChange}
            onMatchCountChange={onRightMatchCountChange}
            onLocateOffset={onLocateRightOffset}
            onCopyValue={onCopyRightValue}
            onEditValue={onEditRightValue}
            onUnescapeValue={onUnescapeRightValue}
            onOpenFind={onOpenRightFind}
          />
        ) : !isBuildingDedicatedRightViewer ? (
          <Editor
            onMount={onRightMount}
            theme={isDarkMode ? 'vs-dark' : 'vs-light'}
            options={getMonacoOptions({
              largeMode: isLargeFileMode,
              wrapLongLines,
              readOnly: true,
              enableStructuralFolding: shouldEnableRightPaneFolding,
            })}
            height="100%"
            loading={null}
          />
        ) : null}
        {!formattedValue && !isImportingActiveTab && !isBuildingDedicatedRightViewer && (
          <div className="editor-center-placeholder">
            {processingStageText ?? (isFormattingActiveTab ? '正在格式化...' : '格式化结果')}
          </div>
        )}
        {isBuildingDedicatedRightViewer && !isImportingActiveTab && (
          <div className="editor-loading-overlay">{processingStageText ?? '正在构建大文件查看模式...'}</div>
        )}
        {processingStageText && !isBuildingDedicatedRightViewer && (
          <div className="editor-loading-overlay">{processingStageText}</div>
        )}
      </div>
    </div>
  </Split>
);

export default JsonEditorPanes;
