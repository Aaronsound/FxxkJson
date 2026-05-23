import React, { useMemo, useState } from 'react';
import { PerformanceSnapshot } from '../types/jsonTool';
import { useFloatingPanelPosition } from '../hooks/useFloatingPanelPosition';
import { writeTextToClipboard } from '../utils/clipboard';
import {
  buildPerformanceDiagnosticsSummary,
  formatPerformanceBytes,
  formatPerformanceDuration,
  getPerformanceBottleneck,
  getPerformanceDiagnosis,
  getPerformanceTriggerLabel,
  performanceStageLabels,
} from '../utils/performanceDiagnostics';

interface JsonPerformancePanelProps {
  snapshot: PerformanceSnapshot | null;
  history?: PerformanceSnapshot[];
  isDarkMode: boolean;
}

function getStatusLabel(snapshot: PerformanceSnapshot) {
  if (snapshot.status === 'failed') {
    return '失败';
  }

  if (snapshot.status === 'running') {
    return '采集中';
  }

  return '完成';
}

const JsonPerformancePanel: React.FC<JsonPerformancePanelProps> = ({ snapshot, history = [], isDarkMode }) => {
  const [expanded, setExpanded] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const { isDragging, panelRef, panelStyle, startDragging } = useFloatingPanelPosition(expanded);

  const bottleneck = useMemo(
    () => (snapshot ? getPerformanceBottleneck(snapshot) : { key: null, label: '--', duration: '--' }),
    [snapshot]
  );
  const diagnosis = useMemo(() => (snapshot ? getPerformanceDiagnosis(snapshot) : ''), [snapshot]);
  const diagnosticsSummary = useMemo(
    () => (snapshot ? buildPerformanceDiagnosticsSummary(snapshot, history) : ''),
    [history, snapshot]
  );

  return (
    <aside
      ref={panelRef}
      style={panelStyle}
      className={[
        'performance-panel',
        isDarkMode ? 'performance-panel-dark' : '',
        expanded ? 'performance-panel-expanded' : 'performance-panel-collapsed',
        isDragging ? 'performance-panel-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="performance-panel-topbar" onPointerDown={startDragging}>
        <div className="performance-panel-title-block">
          <strong>性能分析</strong>
          <span className="performance-panel-status-chip">{snapshot ? getStatusLabel(snapshot) : '等待数据'}</span>
        </div>
        <button type="button" className="performance-toggle-button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? '收起' : '展开'}
        </button>
      </div>

      <div className="performance-panel-compact">
        {snapshot ? (
          <>
            <span>{getPerformanceTriggerLabel(snapshot.trigger)}</span>
            <span>Viewer {formatPerformanceDuration(snapshot.totalToViewerReadyMs)}</span>
            <span>总耗时 {formatPerformanceDuration(snapshot.totalToFormattedMs)}</span>
            <span>瓶颈 {bottleneck.label}</span>
            <span>{diagnosis}</span>
          </>
        ) : (
          <span>导入、粘贴或格式化 JSON 后显示性能数据。</span>
        )}
      </div>

      {expanded && snapshot && (
        <>
          <div className="performance-panel-header">
            <div>
              <span className="performance-panel-subtitle">{snapshot.sourceLabel}</span>
            </div>
            <div className="performance-panel-status">
              <span>{new Date(snapshot.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>
              <button
                type="button"
                className="performance-copy-button"
                onClick={async () => {
                  await writeTextToClipboard(diagnosticsSummary);
                  setCopyNotice('已复制摘要');
                  window.setTimeout(() => setCopyNotice(null), 1600);
                }}
              >
                复制摘要
              </button>
            </div>
          </div>

          <div className="performance-summary-grid">
            <div className="performance-card">
              <span className="performance-card-label">原始大小</span>
              <strong>{formatPerformanceBytes(snapshot.rawBytes)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">格式化后</span>
              <strong>{formatPerformanceBytes(snapshot.formattedBytes)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">总耗时</span>
              <strong>{formatPerformanceDuration(snapshot.totalToFormattedMs)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">Viewer</span>
              <strong>{formatPerformanceDuration(snapshot.totalToViewerReadyMs)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">主要瓶颈</span>
              <strong>{`${bottleneck.label} (${bottleneck.duration})`}</strong>
            </div>
          </div>

          <div className="performance-diagnosis">{diagnosis}</div>

          <div className="performance-stage-grid">
            {performanceStageLabels.map((stage) => (
              <div key={stage.key} className="performance-stage-row">
                <span>{stage.label}</span>
                <strong>{formatPerformanceDuration(snapshot[stage.key])}</strong>
              </div>
            ))}
          </div>

          {history.length > 0 && (
            <div className="performance-history">
              <div className="performance-history-title">最近记录</div>
              {history.slice(0, 6).map((item) => (
                <div key={item.runId} className="performance-history-row">
                  <span>{item.sourceLabel}</span>
                  <strong>{formatPerformanceBytes(item.rawBytes)}</strong>
                  <strong>{formatPerformanceDuration(item.totalToFormattedMs)}</strong>
                  <strong>{formatPerformanceDuration(item.totalToViewerReadyMs)}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="performance-meta-row">
            <span>文件大小：{snapshot.fileSizeBytes ? formatPerformanceBytes(snapshot.fileSizeBytes) : '--'}</span>
            <span>大文件模式：{snapshot.largeMode ? '开启' : '关闭'}</span>
            <span>定位索引：{snapshot.structureEnabled ? '启用' : '未启用'}</span>
            {copyNotice && <span>{copyNotice}</span>}
          </div>

          {snapshot.error && <div className="performance-error">{snapshot.error}</div>}
        </>
      )}
    </aside>
  );
};

export default JsonPerformancePanel;
