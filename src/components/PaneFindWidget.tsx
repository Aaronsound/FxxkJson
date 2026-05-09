import React, { useEffect, useRef } from 'react';
import type { JsonSearchOptions } from '../types/jsonTool';

export interface PaneFindResultItem {
  index: number;
  label: string;
  detail?: string;
}

interface PaneFindWidgetProps {
  value: string;
  currentIndex: number;
  matchCount: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
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
  onSelectResult?: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

const PaneFindWidget: React.FC<PaneFindWidgetProps> = ({
  value,
  currentIndex,
  matchCount,
  hasMore = false,
  isLoadingMore = false,
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
  onSelectResult,
  onPrev,
  onNext,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shouldShowResultList = resultItems.length > 0;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const updateOption = (key: keyof JsonSearchOptions) => {
    onSearchOptionsChange({
      ...searchOptions,
      [key]: !searchOptions[key],
    });
  };

  return (
    <div className="pane-find-layer">
      <div
        className={`pane-find-widget ${isDarkMode ? 'dark' : ''} ${canReplace ? 'with-replace' : ''}`}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="pane-find-row">
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
          <span className="pane-find-count">
            {matchCount > 0 ? `${currentIndex}/${matchCount}${hasMore ? '+' : ''}` : '0/0'}
          </span>
          {hasMore && (
            <button
              type="button"
              className="pane-find-button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? '加载中...' : '加载更多'}
            </button>
          )}
          <div className="pane-find-options" aria-label="搜索匹配规则">
            <button
              type="button"
              className={`pane-find-button pane-find-option ${searchOptions.matchCase ? 'active' : ''}`}
              onClick={() => updateOption('matchCase')}
              aria-pressed={searchOptions.matchCase}
              title="区分大小写"
            >
              Aa
            </button>
            <button
              type="button"
              className={`pane-find-button pane-find-option ${searchOptions.wholeWord ? 'active' : ''}`}
              onClick={() => updateOption('wholeWord')}
              aria-pressed={searchOptions.wholeWord}
              title="全词匹配"
            >
              Ab
            </button>
            <button
              type="button"
              className={`pane-find-button pane-find-option ${searchOptions.useRegex ? 'active' : ''}`}
              onClick={() => updateOption('useRegex')}
              aria-pressed={searchOptions.useRegex}
              title="使用正则表达式"
            >
              .*
            </button>
          </div>
          <button
            type="button"
            className="pane-find-button"
            onClick={onPrev}
            disabled={matchCount === 0}
          >
            上一个
          </button>
          <button
            type="button"
            className="pane-find-button"
            onClick={onNext}
            disabled={matchCount === 0}
          >
            下一个
          </button>
          <button
            type="button"
            className="pane-find-button pane-find-close"
            onClick={onClose}
            aria-label="关闭搜索"
            title="关闭搜索"
          >
            x
          </button>
        </div>
        {canReplace && (
          <div className="pane-find-row pane-find-replace-row">
            <input
              className="pane-find-input"
              placeholder="替换为"
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
              <button
                type="button"
                className="pane-find-button"
                onClick={onReplace}
                disabled={matchCount === 0}
              >
                替换
              </button>
              <button
                type="button"
                className="pane-find-button"
                onClick={onReplaceAll}
                disabled={matchCount === 0}
              >
                全部替换
              </button>
            </div>
          </div>
        )}
        {shouldShowResultList && (
          <div className="pane-find-results" aria-label={resultListLabel ?? '搜索结果'}>
            {resultListLabel && (
              <div className="pane-find-results-label">{resultListLabel}</div>
            )}
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
                  {item.detail && (
                    <span className="pane-find-result-detail">{item.detail}</span>
                  )}
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
