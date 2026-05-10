import React from 'react';
import { StructureStatus } from '../types/jsonTool';

interface JsonToolToolbarProps {
  onImport: () => void;
  onFormat: () => void;
  onRepairJson: () => void;
  onUnescapeJson: () => void;
  onEscapeJson: () => void;
  onClear: () => void;
  onEditJson: () => void;
  onOpenDiagnosticsLog: () => void;
  onFoldAll: () => void;
  onUnfoldAll: () => void;
  canControlRightPaneFolding: boolean;
  isLargeFileMode: boolean;
  canEditJson: boolean;
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
  usesLightweightLocate: boolean;
  currentStructureStatus: StructureStatus;
  processingStageText: string | null;
  currentError: string | null;
}

function getToolbarHintMessage({
  importingFileName,
  isLargeFileMode,
  isLargeFileLocateEnabled,
  canEnableLargeFileLocate,
  usesLightweightLocate,
  currentStructureStatus,
}: Pick<
  JsonToolToolbarProps,
  | 'importingFileName'
  | 'isLargeFileMode'
  | 'isLargeFileLocateEnabled'
  | 'canEnableLargeFileLocate'
  | 'usesLightweightLocate'
  | 'currentStructureStatus'
>) {
  if (importingFileName) {
    return `正在导入 ${importingFileName}...`;
  }

  if (!isLargeFileMode && !isLargeFileLocateEnabled) {
    return null;
  }

  if (!isLargeFileMode) {
    return '已预设大文件定位：下次导入 5MB 以上 JSON 时，会按当前选择启用结构定位或轻量定位。';
  }

  if (!canEnableLargeFileLocate) {
    return '大文件轻量模式已开启：当前没有可定位的原始内容。';
  }

  if (usesLightweightLocate) {
    if (!isLargeFileLocateEnabled) {
      return '超大文件轻量模式已开启：当前未启用右侧定位，可勾选后使用轻量文本定位。';
    }

    if (currentStructureStatus === 'building') {
      return '超大文件轻量模式已开启：正在准备轻量定位，完成后可从右侧点击定位到左侧。';
    }

    if (currentStructureStatus === 'ready') {
      return '超大文件轻量模式已开启：已使用文本 token 映射右侧点击位置，重复内容可能定位到近似位置。';
    }

    return '超大文件轻量模式已开启：轻量定位暂不可用，仅保留轻量浏览与格式化。';
  }

  if (!isLargeFileLocateEnabled) {
    return '大文件轻量模式已开启：当前未建立定位索引，如需右侧点击定位左侧，请勾选“大文件启用右侧定位”。';
  }

  if (currentStructureStatus === 'building') {
    return '大文件轻量模式已开启：正在后台建立定位能力，完成后可从右侧点击定位到左侧。';
  }

  if (currentStructureStatus === 'disabled') {
    return '大文件轻量模式已开启：当前内容未能建立定位能力，仅保留轻量浏览与格式化。';
  }

  return '大文件轻量模式已开启：已保留右侧点击定位左侧的能力，并优先保证滚动和交互流畅。';
}

const JsonToolToolbar: React.FC<JsonToolToolbarProps> = ({
  onImport,
  onFormat,
  onRepairJson,
  onUnescapeJson,
  onEscapeJson,
  onClear,
  onEditJson,
  onOpenDiagnosticsLog,
  onFoldAll,
  onUnfoldAll,
  canControlRightPaneFolding,
  isLargeFileMode,
  canEditJson,
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
  usesLightweightLocate,
  currentStructureStatus,
  processingStageText,
  currentError,
}) => {
  const hintMessage = getToolbarHintMessage({
    importingFileName,
    isLargeFileMode,
    isLargeFileLocateEnabled,
    canEnableLargeFileLocate,
    usesLightweightLocate,
    currentStructureStatus,
  });

  return (
    <div className="toolbar">
      <div className="toolbar-layout">
        <div className="toolbar-top-row">
          <section className="toolbar-section toolbar-section-actions">
            <span className="toolbar-section-label">操作</span>
            <div className="toolbar-section-body toolbar-actions-layout">
              <div className="toolbar-actions-primary">
                <button className="toolbar-button-primary" onClick={onImport}>
                  导入 JSON
                </button>
                <button className="toolbar-button-primary" onClick={onFormat}>
                  格式化
                </button>
                <button className="toolbar-button-primary" onClick={onRepairJson} disabled={!canEditJson}>
                  修复 JSON
                </button>
              </div>
              <div className="toolbar-actions-secondary">
                <button className="toolbar-button-secondary" onClick={onUnescapeJson} disabled={!canEditJson}>
                  反转义
                </button>
                <button className="toolbar-button-secondary" onClick={onEscapeJson} disabled={!canEditJson}>
                  转义
                </button>
                <button className="toolbar-button-secondary" onClick={onEditJson} disabled={!canEditJson}>
                  编辑 JSON
                </button>
                <button className="toolbar-button-secondary" onClick={onOpenDiagnosticsLog}>
                  诊断日志
                </button>
                <button onClick={onClear}>清空</button>
                <button onClick={onFoldAll} disabled={!canControlRightPaneFolding}>
                  折叠全部
                </button>
                <button onClick={onUnfoldAll} disabled={!canControlRightPaneFolding}>
                  展开全部
                </button>
              </div>
            </div>
          </section>

        </div>

        <div className="toolbar-bottom-row">
          <section className="toolbar-section toolbar-section-view">
            <span className="toolbar-section-label">视图</span>
            <div className="toolbar-section-body toolbar-view-row">
              <label className="toolbar-checkbox">
                <input
                  type="checkbox"
                  checked={wrapLongLines}
                  onChange={(event) => onWrapLongLinesChange(event.target.checked)}
                />
                自动换行
              </label>
              <label className="toolbar-checkbox">
                <input
                  type="checkbox"
                  checked={isLargeFileLocateEnabled}
                  disabled={isLargeFileMode && !canEnableLargeFileLocate}
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
              <button className="toolbar-button-secondary" onClick={onToggleDarkMode}>
                {isDarkMode ? '浅色模式' : '深色模式'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {(processingStageText || hintMessage || currentError) && (
        <div className="toolbar-feedback">
          {processingStageText && <span className="toolbar-hint">{processingStageText}</span>}
          {hintMessage && <span className="toolbar-hint">{hintMessage}</span>}
          {currentError && <span className="toolbar-error">{currentError}</span>}
        </div>
      )}
    </div>
  );
};

export default JsonToolToolbar;
