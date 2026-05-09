import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PerformanceSnapshot } from '../types/jsonTool';

interface JsonPerformancePanelProps {
  snapshot: PerformanceSnapshot | null;
  isDarkMode: boolean;
}

type StageKey =
  | 'readFileMs'
  | 'leftModelSyncMs'
  | 'formatQueueMs'
  | 'formatWorkerMs'
  | 'rightModelSyncMs'
  | 'viewerIndexMs'
  | 'structureIndexMs';

type PanelPosition = {
  x: number;
  y: number;
};

const PANEL_POSITION_STORAGE_KEY = 'hanjson.performancePanel.position.v4';

const stageLabels: Array<{ key: StageKey; label: string }> = [
  { key: 'readFileMs', label: '读取文件' },
  { key: 'leftModelSyncMs', label: '左侧挂载' },
  { key: 'formatQueueMs', label: '排队等待' },
  { key: 'formatWorkerMs', label: 'Worker 格式化' },
  { key: 'rightModelSyncMs', label: '右侧挂载' },
  { key: 'viewerIndexMs', label: 'Viewer 索引' },
  { key: 'structureIndexMs', label: '定位索引' },
];

function formatDuration(value: number | null) {
  if (typeof value !== 'number') {
    return '--';
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

function formatBytes(value: number) {
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function getTriggerLabel(trigger: PerformanceSnapshot['trigger']) {
  switch (trigger) {
    case 'import':
      return '导入后自动格式化';
    case 'manual-format':
      return '手动格式化';
    case 'edit-save':
      return '编辑保存后格式化';
    case 'paste':
      return '粘贴后自动格式化';
    default:
      return trigger;
  }
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

function getBottleneck(snapshot: PerformanceSnapshot) {
  const topStage = stageLabels
    .map((stage) => ({ label: stage.label, value: snapshot[stage.key] }))
    .filter((stage) => typeof stage.value === 'number')
    .sort((a, b) => (b.value as number) - (a.value as number))[0];

  if (!topStage || typeof topStage.value !== 'number') {
    return {
      label: '--',
      duration: '--',
    };
  }

  return {
    label: topStage.label,
    duration: formatDuration(topStage.value),
  };
}

function readStoredPosition() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PanelPosition>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return null;
    }

    return parsed as PanelPosition;
  } catch {
    return null;
  }
}

const JsonPerformancePanel: React.FC<JsonPerformancePanelProps> = ({
  snapshot,
  isDarkMode,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(() => readStoredPosition());
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const bottleneck = useMemo(
    () => (snapshot ? getBottleneck(snapshot) : { label: '--', duration: '--' }),
    [snapshot]
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
    if (typeof window === 'undefined') {
      return;
    }

    if (!position) {
      window.localStorage.removeItem(PANEL_POSITION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragOffset = dragOffsetRef.current;
      if (!dragOffset) {
        return;
      }

      const next = clampPosition(
        event.clientX - dragOffset.x,
        event.clientY - dragOffset.y
      );
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
    if (!position) {
      return;
    }

    const handleViewportChange = () => {
      setPosition((current) => (
        current ? clampPosition(current.x, current.y) : current
      ));
    };

    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('fullscreenchange', handleViewportChange);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('fullscreenchange', handleViewportChange);
    };
  }, [position]);

  useEffect(() => {
    if (!position) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setPosition((current) => (
        current ? clampPosition(current.x, current.y) : current
      ));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [expanded]);

  if (!snapshot) {
    return null;
  }

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
      ].filter(Boolean).join(' ')}
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
          <span className="performance-panel-status-chip">{getStatusLabel(snapshot)}</span>
        </div>
        <button
          type="button"
          className="performance-toggle-button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>

      <div className="performance-panel-compact">
        <span>{getTriggerLabel(snapshot.trigger)}</span>
        <span>Viewer {formatDuration(snapshot.totalToViewerReadyMs)}</span>
        <span>总耗时 {formatDuration(snapshot.totalToFormattedMs)}</span>
        <span>瓶颈 {bottleneck.label}</span>
      </div>

      {expanded && (
        <>
          <div className="performance-panel-header">
            <div>
              <span className="performance-panel-subtitle">{snapshot.sourceLabel}</span>
            </div>
            <div className="performance-panel-status">
              <span>{new Date(snapshot.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>
            </div>
          </div>

          <div className="performance-summary-grid">
            <div className="performance-card">
              <span className="performance-card-label">原始大小</span>
              <strong>{formatBytes(snapshot.rawBytes)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">格式化后</span>
              <strong>{formatBytes(snapshot.formattedBytes)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">总耗时</span>
              <strong>{formatDuration(snapshot.totalToFormattedMs)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">Viewer</span>
              <strong>{formatDuration(snapshot.totalToViewerReadyMs)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">主要瓶颈</span>
              <strong>{`${bottleneck.label} (${bottleneck.duration})`}</strong>
            </div>
          </div>

          <div className="performance-stage-grid">
            {stageLabels.map((stage) => (
              <div key={stage.key} className="performance-stage-row">
                <span>{stage.label}</span>
                <strong>{formatDuration(snapshot[stage.key])}</strong>
              </div>
            ))}
          </div>

          <div className="performance-meta-row">
            <span>文件大小：{snapshot.fileSizeBytes ? formatBytes(snapshot.fileSizeBytes) : '--'}</span>
            <span>大文件模式：{snapshot.largeMode ? '开启' : '关闭'}</span>
            <span>定位索引：{snapshot.structureEnabled ? '启用' : '未启用'}</span>
          </div>

          {snapshot.error && (
            <div className="performance-error">
              {snapshot.error}
            </div>
          )}
        </>
      )}
    </aside>
  );
};

export default JsonPerformancePanel;
