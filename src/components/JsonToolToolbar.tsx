import React from 'react';
import { StructureStatus } from '../types/jsonTool';

interface JsonToolToolbarProps {
  onImport: () => void;
  onFormat: () => void;
  onClear: () => void;
  onEditJson: () => void;
  onFoldAll: () => void;
  onUnfoldAll: () => void;
  isLargeFileMode: boolean;
  canEditJson: boolean;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  hasSearchMatches: boolean;
  wrapLongLines: boolean;
  onWrapLongLinesChange: (checked: boolean) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isLargeFileLocateEnabled: boolean;
  onLargeFileLocateToggle: (checked: boolean) => void;
  showPerformancePanel: boolean;
  onShowPerformancePanelChange: (checked: boolean) => void;
  importingFileName: string | null;
  canEnableLargeFileLocate: boolean;
  currentStructureStatus: StructureStatus;
  currentError: string | null;
}

function getToolbarHintMessage({
  importingFileName,
  isLargeFileMode,
  isLargeFileLocateEnabled,
  canEnableLargeFileLocate,
  currentStructureStatus,
}: Pick<
  JsonToolToolbarProps,
  'importingFileName'
  | 'isLargeFileMode'
  | 'isLargeFileLocateEnabled'
  | 'canEnableLargeFileLocate'
  | 'currentStructureStatus'
>) {
  if (importingFileName) {
    return `正在导入 ${importingFileName}...`;
  }

  if (!isLargeFileMode && !isLargeFileLocateEnabled) {
    return null;
  }

  if (!isLargeFileMode) {
    return '已预设大文件定位：下次导入 5MB-20MB 的 JSON 时，会按当前选择决定是否建立右侧定位索引。';
  }

  if (!canEnableLargeFileLocate) {
    return '大文件轻量模式已开启：当前文件过大，已关闭结构联动，仅保留轻量浏览与格式化。';
  }

  if (!isLargeFileLocateEnabled) {
    return '大文件轻量模式已开启：当前未建立定位索引，如需右侧点击定位左侧，请勾选“大文件启用右侧定位”。';
  }

  if (currentStructureStatus === 'building') {
    return '大文件轻量模式已开启：正在后台建立定位索引，完成后可从右侧点击定位到左侧。';
  }

  return '大文件轻量模式已开启：已保留右侧点击定位左侧的能力，并优先保证滚动和交互流畅。';
}

const JsonToolToolbar: React.FC<JsonToolToolbarProps> = ({
  onImport,
  onFormat,
  onClear,
  onEditJson,
  onFoldAll,
  onUnfoldAll,
  isLargeFileMode,
  canEditJson,
  searchTerm,
  onSearchTermChange,
  onPrevMatch,
  onNextMatch,
  hasSearchMatches,
  wrapLongLines,
  onWrapLongLinesChange,
  isDarkMode,
  onToggleDarkMode,
  isLargeFileLocateEnabled,
  onLargeFileLocateToggle,
  showPerformancePanel,
  onShowPerformancePanelChange,
  importingFileName,
  canEnableLargeFileLocate,
  currentStructureStatus,
  currentError,
}) => {
  const hintMessage = getToolbarHintMessage({
    importingFileName,
    isLargeFileMode,
    isLargeFileLocateEnabled,
    canEnableLargeFileLocate,
    currentStructureStatus,
  });

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button onClick={onImport}>导入 JSON</button>
        <button onClick={onFormat}>格式化</button>
        <button onClick={onClear}>清除</button>
        <button onClick={onEditJson} disabled={!canEditJson}>编辑 JSON</button>
        <button onClick={onFoldAll} disabled={isLargeFileMode}>
          折叠全部
        </button>
        <button onClick={onUnfoldAll} disabled={isLargeFileMode}>
          展开全部
        </button>
      </div>

      <div className="toolbar-group toolbar-search">
        <input
          className="toolbar-input"
          placeholder="搜索格式化结果..."
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
        />
        <button onClick={onPrevMatch} disabled={!hasSearchMatches}>
          上一个
        </button>
        <button onClick={onNextMatch} disabled={!hasSearchMatches}>
          下一个
        </button>
      </div>

      <div className="toolbar-group toolbar-options">
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={wrapLongLines}
            onChange={(event) => onWrapLongLinesChange(event.target.checked)}
          />
          自动换行
        </label>
        <button onClick={onToggleDarkMode} className="toolbar-toggle">
          {isDarkMode ? '切回浅色' : '切换深色'}
        </button>
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={isLargeFileLocateEnabled}
            onChange={(event) => onLargeFileLocateToggle(event.target.checked)}
          />
          大文件启用右侧定位
        </label>
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={showPerformancePanel}
            onChange={(event) => onShowPerformancePanelChange(event.target.checked)}
          />
          显示性能面板
        </label>
      </div>

      <div className="toolbar-more">
        <select
          onChange={(event) => {
            if (event.target.value === 'wrap') {
              onWrapLongLinesChange(!wrapLongLines);
            } else if (event.target.value === 'theme') {
              onToggleDarkMode();
            } else if (event.target.value === 'performance') {
              onShowPerformancePanelChange(!showPerformancePanel);
            }

            event.target.value = '';
          }}
        >
          <option value="" hidden>更多</option>
          <option value="wrap">{wrapLongLines ? '关闭自动换行' : '开启自动换行'}</option>
          <option value="theme">{isDarkMode ? '切回浅色' : '切换深色'}</option>
          <option value="performance">{showPerformancePanel ? '隐藏性能面板' : '显示性能面板'}</option>
        </select>
      </div>

      {hintMessage && <span className="toolbar-hint">{hintMessage}</span>}
      {currentError && <span className="toolbar-error">{currentError}</span>}
    </div>
  );
};

export default JsonToolToolbar;
