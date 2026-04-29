import React, { useEffect, useRef } from 'react';
import type { JsonSearchOptions } from '../types/jsonTool';

interface PaneFindWidgetProps {
  value: string;
  currentIndex: number;
  matchCount: number;
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
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

const PaneFindWidget: React.FC<PaneFindWidgetProps> = ({
  value,
  currentIndex,
  matchCount,
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
  onPrev,
  onNext,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

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
            {matchCount > 0 ? `${currentIndex}/${matchCount}` : '0/0'}
          </span>
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
      </div>
    </div>
  );
};

export default PaneFindWidget;
