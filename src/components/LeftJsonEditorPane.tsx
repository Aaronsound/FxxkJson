import React from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import LargeRawReadonlyViewer, { LargeRawReadonlyViewerHandle } from './LargeRawReadonlyViewer';
import PaneFindWidget from './PaneFindWidget';
import type { JsonSearchOptions, LargeRawViewerData } from '../types/jsonTool';
import { getMonacoOptions } from '../utils/jsonEditorInteractions';
import { getJsonEditorTheme } from '../utils/jsonEditorTypography';
import { createTranslator, type I18nKey } from '../utils/i18n';

interface LeftJsonEditorPaneProps {
  activeLeftMatchCount: number;
  activeLargeRawViewerData: LargeRawViewerData | null;
  activeRawText: string;
  isDarkMode: boolean;
  isLargeFileMode: boolean;
  isLeftFindOpen: boolean;
  isLeftSearchLoadingMore: boolean;
  largeRawViewerRef: React.MutableRefObject<LargeRawReadonlyViewerHandle | null>;
  leftPaneMetaText: string;
  leftRawHighlightRange: { start: number; end: number } | null;
  leftReplaceText: string;
  leftSearchHasMore: boolean;
  leftSearchOptions: JsonSearchOptions;
  leftSearchTerm: string;
  normalizedLeftMatchIndex: number;
  processingStageText: string | null;
  shouldShowLeftPlaceholder: boolean;
  shouldUseDedicatedLeftViewer: boolean;
  wrapLongLines: boolean;
  onCloseLeftFind: () => void;
  onLeftChange: (value?: string) => void;
  onLeftMount: OnMount;
  onLeftReplace: () => void;
  onLeftReplaceAll: () => void;
  onLeftReplaceValueChange: (value: string) => void;
  onLeftSearchOptionsChange: (options: JsonSearchOptions) => void;
  onLeftSearchTermChange: (value: string) => void;
  onLoadMoreLeftSearch: () => void;
  onNextLeft: () => void;
  onPrevLeft: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const LeftJsonEditorPane: React.FC<LeftJsonEditorPaneProps> = ({
  activeLeftMatchCount,
  activeLargeRawViewerData,
  activeRawText,
  isDarkMode,
  isLargeFileMode,
  isLeftFindOpen,
  isLeftSearchLoadingMore,
  largeRawViewerRef,
  leftPaneMetaText,
  leftRawHighlightRange,
  leftReplaceText,
  leftSearchHasMore,
  leftSearchOptions,
  leftSearchTerm,
  normalizedLeftMatchIndex,
  processingStageText,
  shouldShowLeftPlaceholder,
  shouldUseDedicatedLeftViewer,
  wrapLongLines,
  onCloseLeftFind,
  onLeftChange,
  onLeftMount,
  onLeftReplace,
  onLeftReplaceAll,
  onLeftReplaceValueChange,
  onLeftSearchOptionsChange,
  onLeftSearchTermChange,
  onLoadMoreLeftSearch,
  onNextLeft,
  onPrevLeft,
  t = defaultT,
}) => (
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
      {isLeftFindOpen && (
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
      {shouldShowLeftPlaceholder && <div className="editor-center-placeholder">{t('pane.rawPlaceholder')}</div>}
      {processingStageText && <div className="editor-loading-overlay">{processingStageText}</div>}
    </div>
  </div>
);

export default LeftJsonEditorPane;
