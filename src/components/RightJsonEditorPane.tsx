import React from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import LargeJsonReadonlyViewer, { LargeJsonReadonlyViewerHandle } from './LargeJsonReadonlyViewer';
import type { PaneFindPathItem } from './PaneFindWidget';
import PaneFindWidget from './PaneFindWidget';
import type { JsonSearchOptions, LargeJsonSearchMatch, LargeJsonViewerData } from '../types/jsonTool';
import { getMonacoOptions } from '../utils/jsonEditorInteractions';
import { getJsonEditorTheme } from '../utils/jsonEditorTypography';
import { createTranslator, type I18nKey } from '../utils/i18n';

interface RightJsonEditorPaneProps {
  activeLargeViewerCollapsedLines: number[];
  activeLargeViewerData: LargeJsonViewerData | null;
  activeRightMatchCount: number;
  formattedValue: string;
  isBuildingDedicatedRightViewer: boolean;
  isDarkMode: boolean;
  isFormattingActiveTab: boolean;
  isImportingActiveTab: boolean;
  isLargeFileMode: boolean;
  isRightFindOpen: boolean;
  isRightSearchLoadingMore: boolean;
  largeViewerMatches: LargeJsonSearchMatch[];
  largeViewerRef: React.MutableRefObject<LargeJsonReadonlyViewerHandle | null>;
  normalizedRightMatchIndex: number;
  processingStageText: string | null;
  rightMatchIndex: number;
  rightPaneMetaText: string;
  rightPinnedPaths: PaneFindPathItem[];
  rightRecentSearches: string[];
  rightSearchHasMore: boolean;
  rightSearchOptions: JsonSearchOptions;
  rightSearchTerm: string;
  rightSelectedRange: { start: number; end: number } | null;
  shouldEnableRightPaneFolding: boolean;
  shouldUseDedicatedRightViewer: boolean;
  wrapLongLines: boolean;
  onCloseRightFind: () => void;
  onCopyRightCompactJson: (offset: number) => void;
  onCopyRightFormattedJson: (offset: number) => void;
  onCopyRightKey: (offset: number) => void;
  onCopyRightPath: (offset: number) => void;
  onCopyRightValue: (offset: number) => void;
  onDeleteRightValue: (offset: number) => void;
  onEditRightValue: (offset: number) => void;
  onLoadMoreRightSearch: () => void;
  onLocateRightOffset: (offset: number) => void;
  onNextRight: () => void;
  onOpenRightFind: () => void;
  onPinCurrentRightPath: () => void;
  onPrevRight: () => void;
  onRenameRightKey: (offset: number) => void;
  onRightCollapsedLinesChange: (lines: number[]) => void;
  onRightMatchCountChange: (count: number) => void;
  onRightMount: OnMount;
  onRightSearchOptionsChange: (options: JsonSearchOptions) => void;
  onRightSearchTermChange: (value: string) => void;
  onSelectRightPinnedPath: (id: string) => void;
  onSelectRightRecentSearch: (value: string) => void;
  onUnescapeRightValue: (offset: number) => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const RightJsonEditorPane: React.FC<RightJsonEditorPaneProps> = ({
  activeLargeViewerCollapsedLines,
  activeLargeViewerData,
  activeRightMatchCount,
  formattedValue,
  isBuildingDedicatedRightViewer,
  isDarkMode,
  isFormattingActiveTab,
  isImportingActiveTab,
  isLargeFileMode,
  isRightFindOpen,
  isRightSearchLoadingMore,
  largeViewerMatches,
  largeViewerRef,
  normalizedRightMatchIndex,
  processingStageText,
  rightMatchIndex,
  rightPaneMetaText,
  rightPinnedPaths,
  rightRecentSearches,
  rightSearchHasMore,
  rightSearchOptions,
  rightSearchTerm,
  rightSelectedRange,
  shouldEnableRightPaneFolding,
  shouldUseDedicatedRightViewer,
  wrapLongLines,
  onCloseRightFind,
  onCopyRightCompactJson,
  onCopyRightFormattedJson,
  onCopyRightKey,
  onCopyRightPath,
  onCopyRightValue,
  onDeleteRightValue,
  onEditRightValue,
  onLoadMoreRightSearch,
  onLocateRightOffset,
  onNextRight,
  onOpenRightFind,
  onPinCurrentRightPath,
  onPrevRight,
  onRenameRightKey,
  onRightCollapsedLinesChange,
  onRightMatchCountChange,
  onRightMount,
  onRightSearchOptionsChange,
  onRightSearchTermChange,
  onSelectRightPinnedPath,
  onSelectRightRecentSearch,
  onUnescapeRightValue,
  t = defaultT,
}) => (
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
        <span
          className={`editor-pane-header-flag ${shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer ? 'visible' : ''}`}
        >
          {t('pane.lightFoldMode')}
        </span>
        <span className={`editor-pane-header-flag ${isLargeFileMode ? 'visible' : ''}`}>{t('pane.lightMode')}</span>
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
);

export default RightJsonEditorPane;
