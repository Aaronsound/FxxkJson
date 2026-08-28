import type { OnMount } from '@monaco-editor/react';
import type React from 'react';
import type { JsonSearchOptions, LargeRawViewerData } from '../types/jsonTool';
import { createTranslator, type I18nKey } from '../utils/i18n';
import JsonMonacoEditor from './JsonMonacoEditor';
import LargeRawReadonlyViewer, { type LargeRawReadonlyViewerHandle } from './LargeRawReadonlyViewer';
import PaneFindWidget from './PaneFindWidget';

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
  onImportJson: () => void;
  onPasteJson: () => void | Promise<void>;
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
  onImportJson,
  onPasteJson,
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
    <div className={`editor-pane-header ${isDarkMode ? 'dark' : ''}`}>
      <strong className="editor-pane-header-title">{t('pane.rawTitle')}</strong>
      <span className={`editor-pane-header-meta ${isDarkMode ? 'dark' : ''}`}>{leftPaneMetaText}</span>
    </div>
    <div className={`editor-pane-body ${isLeftFindOpen ? 'pane-find-open' : ''}`}>
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
      <div className="editor-pane-content">
        {shouldUseDedicatedLeftViewer ? (
          <LargeRawReadonlyViewer
            ref={largeRawViewerRef}
            text={activeRawText}
            data={activeLargeRawViewerData}
            isDarkMode={isDarkMode}
            highlightRange={leftRawHighlightRange}
          />
        ) : (
          <JsonMonacoEditor
            onMount={onLeftMount}
            isDarkMode={isDarkMode}
            largeMode={isLargeFileMode}
            wrapLongLines={wrapLongLines}
            onChange={onLeftChange}
            height="100%"
          />
        )}
      </div>
      {shouldShowLeftPlaceholder && (
        <div className="editor-empty-state">
          <div className="editor-empty-state-mark" aria-hidden="true">
            {'{ }'}
          </div>
          <strong>{t('pane.rawEmptyTitle')}</strong>
          <span>{t('pane.rawEmptyHint')}</span>
          <div className="editor-empty-state-actions">
            <button type="button" className="editor-empty-state-primary" onClick={onImportJson}>
              {t('pane.rawEmptyImport')}
            </button>
            <button type="button" onClick={onPasteJson}>
              {t('pane.rawEmptyPaste')}
            </button>
          </div>
        </div>
      )}
      {processingStageText && <div className="editor-loading-overlay">{processingStageText}</div>}
    </div>
  </div>
);

export default LeftJsonEditorPane;
