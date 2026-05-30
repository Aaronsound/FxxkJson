import React from 'react';
import Split from 'react-split';
import type { OnMount } from '@monaco-editor/react';
import type { LargeJsonReadonlyViewerHandle } from './LargeJsonReadonlyViewer';
import type { LargeRawReadonlyViewerHandle } from './LargeRawReadonlyViewer';
import type { PaneFindPathItem } from './PaneFindWidget';
import LeftJsonEditorPane from './LeftJsonEditorPane';
import RightJsonEditorPane from './RightJsonEditorPane';
import type {
  JsonSearchOptions,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeRawViewerData,
} from '../types/jsonTool';
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
    <LeftJsonEditorPane
      activeLargeRawViewerData={activeLargeRawViewerData}
      activeLeftMatchCount={activeLeftMatchCount}
      activeRawText={activeRawText}
      isDarkMode={isDarkMode}
      isLargeFileMode={isLargeFileMode}
      isLeftFindOpen={isLeftFindOpen}
      isLeftSearchLoadingMore={isLeftSearchLoadingMore}
      largeRawViewerRef={largeRawViewerRef}
      leftPaneMetaText={leftPaneMetaText}
      leftRawHighlightRange={leftRawHighlightRange}
      leftReplaceText={leftReplaceText}
      leftSearchHasMore={leftSearchHasMore}
      leftSearchOptions={leftSearchOptions}
      leftSearchTerm={leftSearchTerm}
      normalizedLeftMatchIndex={normalizedLeftMatchIndex}
      processingStageText={processingStageText}
      shouldShowLeftPlaceholder={shouldShowLeftPlaceholder}
      shouldUseDedicatedLeftViewer={shouldUseDedicatedLeftViewer}
      wrapLongLines={wrapLongLines}
      onCloseLeftFind={onCloseLeftFind}
      onLeftChange={onLeftChange}
      onLeftMount={onLeftMount}
      onLeftReplace={onLeftReplace}
      onLeftReplaceAll={onLeftReplaceAll}
      onLeftReplaceValueChange={onLeftReplaceValueChange}
      onLeftSearchOptionsChange={onLeftSearchOptionsChange}
      onLeftSearchTermChange={onLeftSearchTermChange}
      onLoadMoreLeftSearch={onLoadMoreLeftSearch}
      onNextLeft={onNextLeft}
      onPrevLeft={onPrevLeft}
      t={t}
    />

    <RightJsonEditorPane
      activeLargeViewerCollapsedLines={activeLargeViewerCollapsedLines}
      activeLargeViewerData={activeLargeViewerData}
      activeRightMatchCount={activeRightMatchCount}
      formattedValue={formattedValue}
      isBuildingDedicatedRightViewer={isBuildingDedicatedRightViewer}
      isDarkMode={isDarkMode}
      isFormattingActiveTab={isFormattingActiveTab}
      isImportingActiveTab={isImportingActiveTab}
      isLargeFileMode={isLargeFileMode}
      isRightFindOpen={isRightFindOpen}
      isRightSearchLoadingMore={isRightSearchLoadingMore}
      largeViewerMatches={largeViewerMatches}
      largeViewerRef={largeViewerRef}
      normalizedRightMatchIndex={normalizedRightMatchIndex}
      processingStageText={processingStageText}
      rightMatchIndex={rightMatchIndex}
      rightPaneMetaText={rightPaneMetaText}
      rightPinnedPaths={rightPinnedPaths}
      rightRecentSearches={rightRecentSearches}
      rightSearchHasMore={rightSearchHasMore}
      rightSearchOptions={rightSearchOptions}
      rightSearchTerm={rightSearchTerm}
      rightSelectedRange={rightSelectedRange}
      shouldEnableRightPaneFolding={shouldEnableRightPaneFolding}
      shouldUseDedicatedRightViewer={shouldUseDedicatedRightViewer}
      wrapLongLines={wrapLongLines}
      onCloseRightFind={onCloseRightFind}
      onCopyRightCompactJson={onCopyRightCompactJson}
      onCopyRightFormattedJson={onCopyRightFormattedJson}
      onCopyRightKey={onCopyRightKey}
      onCopyRightPath={onCopyRightPath}
      onCopyRightValue={onCopyRightValue}
      onDeleteRightValue={onDeleteRightValue}
      onEditRightValue={onEditRightValue}
      onLoadMoreRightSearch={onLoadMoreRightSearch}
      onLocateRightOffset={onLocateRightOffset}
      onNextRight={onNextRight}
      onOpenRightFind={onOpenRightFind}
      onPinCurrentRightPath={onPinCurrentRightPath}
      onPrevRight={onPrevRight}
      onRenameRightKey={onRenameRightKey}
      onRightCollapsedLinesChange={onRightCollapsedLinesChange}
      onRightMatchCountChange={onRightMatchCountChange}
      onRightMount={onRightMount}
      onRightSearchOptionsChange={onRightSearchOptionsChange}
      onRightSearchTermChange={onRightSearchTermChange}
      onSelectRightPinnedPath={onSelectRightPinnedPath}
      onSelectRightRecentSearch={onSelectRightRecentSearch}
      onUnescapeRightValue={onUnescapeRightValue}
      t={t}
    />
  </Split>
);

export default JsonEditorPanes;
