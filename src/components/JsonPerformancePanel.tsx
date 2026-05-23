import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PerformanceSnapshot } from '../types/jsonTool';
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

type PanelPosition = {
  x: number;
  y: number;
};

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
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const bottleneck = useMemo(
    () => (snapshot ? getPerformanceBottleneck(snapshot) : { key: null, label: '--', duration: '--' }),
    [snapshot]
  );
  const diagnosis = useMemo(() => (snapshot ? getPerformanceDiagnosis(snapshot) : ''), [snapshot]);
  const diagnosticsSummary = useMemo(
    () => (snapshot ? buildPerformanceDiagnosticsSummary(snapshot, history) : ''),
    [history, snapshot]
  );

  const clampPosition = (nextX: number, nextY: number) => {
    if (typeof window === 'undefined') {
      return { x: nextX, y: nextY };
    }

    const width = panelRef.current?.offsetWidth ?? 360;
    const height = panelRef.current?.offsetHeight ?? 140;
    const margin = 12;
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);

    return {
      x: Math.min(Math.max(margin, nextX), maxX),
      y: Math.min(Math.max(margin, nextY), maxY),
    };
  };

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragOffset = dragOffsetRef.current;
      if (!dragOffset) {
        return;
      }

      const next = clampPosition(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
      setPosition(next);
    };

    const stopDragging = () => {
      dragOffsetRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleViewportChange = () => {
      dragOffsetRef.current = null;
      setIsDragging(false);
      setPosition(null);
    };

    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('fullscreenchange', handleViewportChange);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('fullscreenchange', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (!position) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setPosition((current) => (current ? clampPosition(current.x, current.y) : current));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [expanded]);

  const panelStyle = position
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
        right: 'auto',
        bottom: 'auto',
      }
    : undefined;

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
      <div
        className="performance-panel-topbar"
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('button')) {
            return;
          }

          const rect = panelRef.current?.getBoundingClientRect();
          if (!rect) {
            return;
          }

          dragOffsetRef.current = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          };
          setPosition((current) => current ?? { x: rect.left, y: rect.top });
          setIsDragging(true);
          event.preventDefault();
        }}
      >
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
