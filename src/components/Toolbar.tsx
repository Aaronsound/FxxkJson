import React from 'react';
import * as monaco from 'monaco-editor';

type ToolbarProps = {
  onImport: () => void;
  onFormat: () => void;
  onClear: () => void;
  onFoldAll: () => void;
  onUnfoldAll: () => void;
  onOpenEditData: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  rightMatches: monaco.editor.FindMatch[];
  onPrevMatch: () => void;
  onNextMatch: () => void;
  wrapLongLines: boolean;
  onToggleWrap: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  error: string | null;
};

/**
 * 顶部工具栏：只负责展示和触发事件，不持有业务状态。
 */
const Toolbar: React.FC<ToolbarProps> = ({
  onImport,
  onFormat,
  onClear,
  onFoldAll,
  onUnfoldAll,
  onOpenEditData,
  searchTerm,
  onSearchTermChange,
  rightMatches,
  onPrevMatch,
  onNextMatch,
  wrapLongLines,
  onToggleWrap,
  isDarkMode,
  onToggleTheme,
  error,
}) => {
  const hasMatches = rightMatches.length > 0;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button onClick={onImport}>导入 JSON</button>
        <button onClick={onFormat}>格式化</button>
        <button onClick={onClear}>清除</button>
        <button onClick={onFoldAll}>折叠全部</button>
        <button onClick={onUnfoldAll}>展开全部</button>
        <button onClick={onOpenEditData}>编辑 JSON</button>
      </div>

      <div className="toolbar-group toolbar-search">
        <input
          className="toolbar-input"
          placeholder="搜索格式化结果…"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
        />
        <button onClick={onPrevMatch} disabled={!hasMatches}>
          上一处
        </button>
        <button onClick={onNextMatch} disabled={!hasMatches}>
          下一处
        </button>
      </div>

      <div className="toolbar-group toolbar-options">
        <label className="toolbar-checkbox">
          <input type="checkbox" checked={wrapLongLines} onChange={onToggleWrap} />
          自动换行
        </label>
        <button onClick={onToggleTheme} className="toolbar-toggle">
          {isDarkMode ? '切回浅色' : '切换深色'}
        </button>
      </div>

      <div className="toolbar-more">
        <select
          onChange={(e) => {
            if (e.target.value === 'wrap') {
              onToggleWrap();
            } else if (e.target.value === 'theme') {
              onToggleTheme();
            }
            e.target.value = '';
          }}
        >
          <option value="" hidden>
            更多
          </option>
          <option value="wrap">{wrapLongLines ? '关闭自动换行' : '开启自动换行'}</option>
          <option value="theme">{isDarkMode ? '切回浅色' : '切换深色'}</option>
        </select>
      </div>

      {error && <span className="toolbar-error">{error}</span>}
    </div>
  );
};

export default React.memo(Toolbar);
