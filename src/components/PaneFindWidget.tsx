import type React from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { JsonSearchOptions } from '../types/jsonTool';
import { createTranslator, type I18nKey } from '../utils/i18n';
import './PaneFindWidget.css';

export interface PaneFindResultItem {
  index: number;
  label: string;
  detail?: string;
}

export interface PaneFindPathItem {
  id: string;
  label: string;
  detail?: string;
}

interface PaneFindWidgetProps {
  value: string;
  currentIndex: number;
  matchCount: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  recentSearches?: string[];
  favoritePaths?: PaneFindPathItem[];
  canPinPath?: boolean;
  resultItems?: PaneFindResultItem[];
  activeResultIndex?: number;
  resultListLabel?: string;
  isDarkMode: boolean;
  placeholder: string;
  searchOptions: JsonSearchOptions;
  canReplace?: boolean;
  replaceValue?: string;
  onChange: (value: string) => void;
  onSearchOptionsChange: (value: JsonSearchOptions) => void;
  onReplaceValueChange?: (value: string) => void;
  onReplace?: () => void;
  onReplaceAll?: () => void;
  onLoadMore?: () => void;
  onSelectRecentSearch?: (value: string) => void;
  onPinPath?: () => void;
  onSelectFavoritePath?: (id: string) => void;
  onSelectResult?: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const PaneFindWidget: React.FC<PaneFindWidgetProps> = ({
  value,
  currentIndex,
  matchCount,
  hasMore = false,
  isLoadingMore = false,
  recentSearches = [],
  favoritePaths = [],
  canPinPath = false,
  resultItems = [],
  activeResultIndex = 0,
  resultListLabel,
  isDarkMode,
  placeholder,
  searchOptions,
  canReplace = false,
  replaceValue = '',
  onChange,
  onSearchOptionsChange,
  onReplaceValueChange,
  onReplace,
  onReplaceAll,
  onLoadMore,
  onSelectRecentSearch,
  onPinPath,
  onSelectFavoritePath,
  onSelectResult,
  onPrev,
  onNext,
  onClose,
  t = defaultT,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const shouldShowResultList = resultItems.length > 0;
  const shouldShowQuickItems = recentSearches.length > 0 || favoritePaths.length > 0 || canPinPath;
  const countText = matchCount > 0 ? `${currentIndex}/${matchCount}${hasMore ? '+' : ''}` : '0/0';
  const searchProgressText = value
    ? hasMore
      ? t('search.loadedCount', { count: matchCount })
      : t('search.totalCount', { count: matchCount })
    : '';

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const paneBody = layer?.closest<HTMLElement>('.editor-pane-body');

    if (!layer || !paneBody) {
      return;
    }

    let animationFrameId: number | null = null;

    const updateReservedBlockSize = () => {
      animationFrameId = null;

      const style = window.getComputedStyle(layer);
      const top = Number.parseFloat(style.top);
      const bottomGap = Number.parseFloat(style.getPropertyValue('--pane-find-layer-bottom-gap'));
      const reservedBlockSize =
        layer.getBoundingClientRect().height +
        (Number.isFinite(top) ? top : 0) +
        (Number.isFinite(bottomGap) ? bottomGap : 8);
      const nextReservedBlockSize = `${Math.ceil(reservedBlockSize)}px`;

      if (paneBody.style.getPropertyValue('--pane-find-reserved-block-size') !== nextReservedBlockSize) {
        paneBody.style.setProperty('--pane-find-reserved-block-size', nextReservedBlockSize);
      }
    };

    const scheduleReservedBlockSizeUpdate = () => {
      if (animationFrameId !== null) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(updateReservedBlockSize);
    };

    scheduleReservedBlockSizeUpdate();

    if (!window.ResizeObserver) {
      return () => {
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
        }

        paneBody.style.removeProperty('--pane-find-reserved-block-size');
      };
    }

    const observer = new window.ResizeObserver(scheduleReservedBlockSizeUpdate);
    observer.observe(layer);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      observer.disconnect();
      paneBody.style.removeProperty('--pane-find-reserved-block-size');
    };
  }, []);

  const updateOption = (key: keyof JsonSearchOptions) => {
    onSearchOptionsChange({
      ...searchOptions,
      [key]: !searchOptions[key],
    });
  };

  return (
    <div className="pane-find-layer" ref={layerRef}>
      <div
        className={`pane-find-widget ${isDarkMode ? 'dark' : ''} ${canReplace ? 'with-replace' : ''}`}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="pane-find-row pane-find-search-row">
          <input
            ref={inputRef}
            className="pane-find-input"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
              }

              if (event.key !== 'Enter') {
                return;
              }

              event.preventDefault();
              if (event.shiftKey) {
                onPrev();
              } else {
                onNext();
              }
            }}
          />
          <span
            className="pane-find-count"
            title={
              hasMore
                ? t('search.loadedCountHint', { count: matchCount })
                : t('search.totalCountHint', { count: matchCount })
            }
          >
            {countText}
          </span>
          {searchProgressText && <span className="pane-find-progress">{searchProgressText}</span>}
          {hasMore && (
            <button type="button" className="pane-find-button" onClick={onLoadMore} disabled={isLoadingMore}>
              {isLoadingMore ? t('search.loadingMore') : t('search.loadMore')}
            </button>
          )}
          <div className="pane-find-options" aria-label={t('search.rulesLabel')}>
            <button
              type="button"
              className={`pane-find-button pane-find-option ${searchOptions.matchCase ? 'active' : ''}`}
              onClick={() => updateOption('matchCase')}
              aria-pressed={searchOptions.matchCase}
              title={t('search.matchCase')}
            >
              Aa
            </button>
            <button
              type="button"
              className={`pane-find-button pane-find-option ${searchOptions.wholeWord ? 'active' : ''}`}
              onClick={() => updateOption('wholeWord')}
              aria-pressed={searchOptions.wholeWord}
              title={t('search.wholeWord')}
            >
              Ab
            </button>
            <button
              type="button"
              className={`pane-find-button pane-find-option ${searchOptions.useRegex ? 'active' : ''}`}
              onClick={() => updateOption('useRegex')}
              aria-pressed={searchOptions.useRegex}
              title={t('search.useRegex')}
            >
              .*
            </button>
          </div>
          <div className="pane-find-navigation">
            <button type="button" className="pane-find-button" onClick={onPrev} disabled={matchCount === 0}>
              {t('search.previous')}
            </button>
            <button type="button" className="pane-find-button" onClick={onNext} disabled={matchCount === 0}>
              {t('search.next')}
            </button>
            <button
              type="button"
              className="pane-find-button pane-find-close"
              onClick={onClose}
              aria-label={t('search.close')}
              title={t('search.close')}
            >
              ×
            </button>
          </div>
        </div>
        {canReplace && (
          <div className="pane-find-row pane-find-replace-row">
            <input
              className="pane-find-input"
              placeholder={t('search.replacePlaceholder')}
              value={replaceValue}
              onChange={(event) => onReplaceValueChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (event.metaKey || event.ctrlKey) {
                    onReplaceAll?.();
                  } else {
                    onReplace?.();
                  }
                }
              }}
            />
            <span className="pane-find-count" aria-hidden="true" />
            <div className="pane-find-replace-actions">
              <button type="button" className="pane-find-button" onClick={onReplace} disabled={matchCount === 0}>
                {t('search.replace')}
              </button>
              <button type="button" className="pane-find-button" onClick={onReplaceAll} disabled={matchCount === 0}>
                {t('search.replaceAll')}
              </button>
            </div>
          </div>
        )}
        {shouldShowQuickItems && (
          <div className="pane-find-quick-panel">
            {(canPinPath || favoritePaths.length > 0) && (
              <div className="pane-find-quick-group">
                <div className="pane-find-quick-label">{t('search.favoritePaths')}</div>
                <div className="pane-find-chips">
                  {canPinPath && (
                    <button type="button" className="pane-find-chip primary" onClick={onPinPath}>
                      {t('search.pinCurrentPath')}
                    </button>
                  )}
                  {favoritePaths.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="pane-find-chip"
                      title={item.detail ?? item.label}
                      onClick={() => onSelectFavoritePath?.(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {recentSearches.length > 0 && (
              <div className="pane-find-quick-group">
                <div className="pane-find-quick-label">{t('search.recent')}</div>
                <div className="pane-find-chips">
                  {recentSearches.map((term) => (
                    <button
                      type="button"
                      key={term}
                      className="pane-find-chip"
                      title={term}
                      onClick={() => onSelectRecentSearch?.(term)}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {shouldShowResultList && (
          <div className="pane-find-results" aria-label={resultListLabel ?? t('search.results')}>
            {resultListLabel && <div className="pane-find-results-label">{resultListLabel}</div>}
            <div className="pane-find-results-list">
              {resultItems.map((item) => (
                <button
                  type="button"
                  key={item.index}
                  className={`pane-find-result ${item.index === activeResultIndex ? 'active' : ''}`}
                  onClick={() => onSelectResult?.(item.index)}
                  title={item.detail ? `${item.label} ${item.detail}` : item.label}
                >
                  <span className="pane-find-result-label">{item.label}</span>
                  {item.detail && <span className="pane-find-result-detail">{item.detail}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaneFindWidget;
