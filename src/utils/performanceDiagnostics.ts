import type { PerformanceSnapshot } from '../types/jsonTool';

export type PerformanceStageKey =
  | 'readFileMs'
  | 'leftModelSyncMs'
  | 'formatQueueMs'
  | 'formatWorkerMs'
  | 'rightModelSyncMs'
  | 'viewerIndexMs'
  | 'structureIndexMs';

export const performanceStageLabels: Array<{ key: PerformanceStageKey; label: string }> = [
  { key: 'readFileMs', label: '读取文件' },
  { key: 'leftModelSyncMs', label: '左侧渲染' },
  { key: 'formatQueueMs', label: '排队等待' },
  { key: 'formatWorkerMs', label: 'Worker 格式化' },
  { key: 'rightModelSyncMs', label: '右侧渲染' },
  { key: 'viewerIndexMs', label: 'Viewer 索引' },
  { key: 'structureIndexMs', label: '定位索引' },
];

export function formatPerformanceDuration(value: number | null) {
  if (typeof value !== 'number') {
    return '--';
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

export function formatPerformanceBytes(value: number | null) {
  if (!value || value <= 0) {
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

export function getPerformanceTriggerLabel(trigger: PerformanceSnapshot['trigger']) {
  switch (trigger) {
    case 'import':
      return '导入后自动格式化';
    case 'manual-format':
      return '手动格式化';
    case 'repair':
      return '手动修复';
    case 'edit-save':
      return '编辑保存后格式化';
    case 'paste':
      return '粘贴后自动格式化';
    default:
      return trigger;
  }
}

export function getPerformanceBottleneck(snapshot: PerformanceSnapshot) {
  const topStage = performanceStageLabels
    .map((stage) => ({ key: stage.key, label: stage.label, value: snapshot[stage.key] }))
    .filter((stage) => typeof stage.value === 'number')
    .sort((a, b) => (b.value as number) - (a.value as number))[0];

  if (!topStage || typeof topStage.value !== 'number') {
    return {
      key: null,
      label: '--',
      duration: '--',
    };
  }

  return {
    key: topStage.key,
    label: topStage.label,
    duration: formatPerformanceDuration(topStage.value),
  };
}

export function getPerformanceDiagnosis(snapshot: PerformanceSnapshot) {
  if (snapshot.status === 'failed') {
    return '处理失败，请打开诊断日志查看错误详情。';
  }

  if (snapshot.status === 'running') {
    return '正在采集性能数据，完成后会显示主要耗时位置。';
  }

  const bottleneck = getPerformanceBottleneck(snapshot);

  switch (bottleneck.key) {
    case 'rightModelSyncMs':
      return '当前慢在右侧渲染，不是 JSON 格式化。高行数内容会优先使用轻量折叠模式。';
    case 'structureIndexMs':
      return '当前慢在定位索引；不需要右侧定位时关闭定位可以提升速度。';
    case 'leftModelSyncMs':
      return '当前慢在左侧原文渲染，通常是原始 JSON 单行过长或体积较大。';
    case 'formatWorkerMs':
      return '当前慢在 Worker 格式化，说明 JSON 解析和 stringify 本身占主要耗时。';
    case 'viewerIndexMs':
      return '当前慢在轻量 viewer 索引，通常是行数或可折叠区域非常多。';
    case 'readFileMs':
      return '当前慢在文件读取，可能和磁盘、网络盘或系统文件权限有关。';
    case 'formatQueueMs':
      return '当前慢在排队等待，可能是上一次格式化或编辑保存还没完成。';
    default:
      return '当前没有明显瓶颈。';
  }
}

export function buildPerformanceDiagnosticsSummary(snapshot: PerformanceSnapshot, history: PerformanceSnapshot[] = []) {
  const bottleneck = getPerformanceBottleneck(snapshot);
  const stageLines = performanceStageLabels.map(
    (stage) => `- ${stage.label}: ${formatPerformanceDuration(snapshot[stage.key])}`
  );
  const historyLines = history
    .slice(0, 3)
    .map(
      (item) =>
        `- ${item.sourceLabel}: total=${formatPerformanceDuration(item.totalToFormattedMs)}, viewer=${formatPerformanceDuration(item.totalToViewerReadyMs)}, raw=${formatPerformanceBytes(item.rawBytes)}`
    );

  return [
    'FxxkJson performance diagnostics',
    `source=${snapshot.sourceLabel}`,
    `trigger=${getPerformanceTriggerLabel(snapshot.trigger)}`,
    `status=${snapshot.status}`,
    `raw=${formatPerformanceBytes(snapshot.rawBytes)}`,
    `formatted=${formatPerformanceBytes(snapshot.formattedBytes)}`,
    `file=${formatPerformanceBytes(snapshot.fileSizeBytes)}`,
    `largeMode=${snapshot.largeMode ? 'on' : 'off'}`,
    `structureIndex=${snapshot.structureEnabled ? 'on' : 'off'}`,
    `total=${formatPerformanceDuration(snapshot.totalToFormattedMs)}`,
    `viewer=${formatPerformanceDuration(snapshot.totalToViewerReadyMs)}`,
    `bottleneck=${bottleneck.label} ${bottleneck.duration}`,
    `diagnosis=${getPerformanceDiagnosis(snapshot)}`,
    '[stages]',
    ...stageLines,
    ...(historyLines.length > 0 ? ['[recent]', ...historyLines] : []),
    snapshot.error ? `[error]\n${snapshot.error}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
