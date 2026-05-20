import React from 'react';
import Split from 'react-split';
import Editor, { OnMount } from '@monaco-editor/react';
import LargeJsonReadonlyViewer, { LargeJsonReadonlyViewerHandle } from './LargeJsonReadonlyViewer';
import LargeRawReadonlyViewer, { LargeRawReadonlyViewerHandle } from './LargeRawReadonlyViewer';
import type { PaneFindPathItem } from './PaneFindWidget';
import PaneFindWidget from './PaneFindWidget';
import type {
  JsonSearchOptions,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeRawViewerData,
} from '../types/jsonTool';
import { getMonacoOptions } from '../utils/jsonEditorInteractions';
import { getJsonEditorTheme } from '../utils/jsonEditorTypography';
import { createTranslator, type I18nKey } from '../utils/i18n';

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
  rightPinnedPaths: PaneFindPathItem[];
  rightRecentSearches: string[];
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
  onCopyRightCompactJson: (offset: number) => void;
  onCopyRightFormattedJson: (offset: number) => void;
  onCopyRightKey: (offset: number) => void;
  onCopyRightPath: (offset: number) => void;
  onCopyRightValue: (offset: number) => void;
  onDeleteRightValue: (offset: number) => void;
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
  onPinCurrentRightPath: () => void;
  onPrevLeft: () => void;
  onPrevRight: () => void;
  onRenameRightKey: (offset: number) => void;
  onSelectRightPinnedPath: (id: string) => void;
  onSelectRightRecentSearch: (value: string) => void;
  onUnescapeRightValue: (offset: number) => void;
  onNextLeft: () => void;
  onNextRight: () => void;
  onRightCollapsedLinesChange: (lines: number[]) => void;
  onRightMatchCountChange: (count: number) => void;
  onRightMount: OnMount;
  onRightSearchOptionsChange: (options: JsonSearchOptions) => void;
  onRightSearchTermChange: (value: string) => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

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
  rightPinnedPaths,
  rightRecentSearches,
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
  onCopyRightCompactJson,
  onCopyRightFormattedJson,
  onCopyRightKey,
  onCopyRightPath,
  onCopyRightValue,
  onDeleteRightValue,
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
  onPinCurrentRightPath,
  onPrevLeft,
  onPrevRight,
  onRenameRightKey,
  onSelectRightPinnedPath,
  onSelectRightRecentSearch,
  onUnescapeRightValue,
  onNextLeft,
  onNextRight,
  onRightCollapsedLinesChange,
  onRightMatchCountChange,
  onRightMount,
  onRightSearchOptionsChange,
  onRightSearchTermChange,
  t = defaultT,
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
            placeholder={t('pane.leftSearchPlaceholder')}
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
            theme={getJsonEditorTheme(isDarkMode)}
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
          <div className="editor-center-placeholder">{t('pane.rawPlaceholder')}</div>
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
            {t('pane.lightFoldMode')}
          </span>
          <span className={`editor-pane-header-flag ${isLargeFileMode ? 'visible' : ''}`}>
            {t('pane.lightMode')}
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
            recentSearches={rightRecentSearches}
            favoritePaths={rightPinnedPaths}
            canPinPath={Boolean(rightSelectedRange)}
            isDarkMode={isDarkMode}
            placeholder={t('pane.rightSearchPlaceholder')}
            searchOptions={rightSearchOptions}
            onChange={onRightSearchTermChange}
            onSearchOptionsChange={onRightSearchOptionsChange}
            onLoadMore={onLoadMoreRightSearch}
            onSelectRecentSearch={onSelectRightRecentSearch}
            onPinPath={onPinCurrentRightPath}
            onSelectFavoritePath={onSelectRightPinnedPath}
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
            onCopyPath={onCopyRightPath}
            onCopyKey={onCopyRightKey}
            onCopyValue={onCopyRightValue}
            onCopyCompactJson={onCopyRightCompactJson}
            onCopyFormattedJson={onCopyRightFormattedJson}
            onEditValue={onEditRightValue}
            onDeleteValue={onDeleteRightValue}
            onRenameKey={onRenameRightKey}
            onUnescapeValue={onUnescapeRightValue}
            onOpenFind={onOpenRightFind}
            t={t}
          />
        ) : !isBuildingDedicatedRightViewer ? (
          <Editor
            onMount={onRightMount}
            theme={getJsonEditorTheme(isDarkMode)}
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
            {processingStageText ?? (isFormattingActiveTab ? t('pane.formatting') : t('pane.formattedPlaceholder'))}
          </div>
        )}
        {isBuildingDedicatedRightViewer && !isImportingActiveTab && (
          <div className="editor-loading-overlay">{processingStageText ?? t('pane.buildingLargeViewer')}</div>
        )}
        {processingStageText && !isBuildingDedicatedRightViewer && (
          <div className="editor-loading-overlay">{processingStageText}</div>
        )}
      </div>
    </div>
  </Split>
);

export default JsonEditorPanes;
