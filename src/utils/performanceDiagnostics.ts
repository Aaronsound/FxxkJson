import type { PerformanceSnapshot } from '../types/jsonTool';
import { createTranslator, type I18nKey } from './i18n';

type Translator = (key: I18nKey, params?: Record<string, string | number>) => string;
const defaultT = createTranslator('zh');

export type PerformanceStageKey =
  | 'readFileMs'
  | 'leftModelSyncMs'
  | 'formatQueueMs'
  | 'formatWorkerMs'
  | 'rightModelSyncMs'
  | 'viewerIndexMs'
  | 'structureIndexMs';

export const performanceStageLabels: Array<{ key: PerformanceStageKey; labelKey: I18nKey }> = [
  { key: 'readFileMs', labelKey: 'performance.stageRead' },
  { key: 'leftModelSyncMs', labelKey: 'performance.stageLeft' },
  { key: 'formatQueueMs', labelKey: 'performance.stageQueue' },
  { key: 'formatWorkerMs', labelKey: 'performance.stageWorker' },
  { key: 'rightModelSyncMs', labelKey: 'performance.stageRight' },
  { key: 'viewerIndexMs', labelKey: 'performance.stageViewer' },
  { key: 'structureIndexMs', labelKey: 'performance.stageStructure' },
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

export function getPerformanceTriggerLabel(trigger: PerformanceSnapshot['trigger'], t: Translator = defaultT) {
  switch (trigger) {
    case 'import':
      return t('performance.triggerImport');
    case 'manual-format':
      return t('performance.triggerManual');
    case 'repair':
      return t('performance.triggerRepair');
    case 'edit-save':
      return t('performance.triggerEditSave');
    case 'paste':
      return t('performance.triggerPaste');
    default:
      return trigger;
  }
}

export function getPerformanceBottleneck(snapshot: PerformanceSnapshot, t: Translator = defaultT) {
  const topStage = performanceStageLabels
    .map((stage) => ({ key: stage.key, label: t(stage.labelKey), value: snapshot[stage.key] }))
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

export function getPerformanceDiagnosis(snapshot: PerformanceSnapshot, t: Translator = defaultT) {
  if (snapshot.status === 'failed') {
    return t('performance.diagnosisFailed');
  }

  if (snapshot.status === 'running') {
    return t('performance.diagnosisRunning');
  }

  const bottleneck = getPerformanceBottleneck(snapshot, t);

  switch (bottleneck.key) {
    case 'rightModelSyncMs':
      return t('performance.diagnosisRight');
    case 'structureIndexMs':
      return t('performance.diagnosisStructure');
    case 'leftModelSyncMs':
      return t('performance.diagnosisLeft');
    case 'formatWorkerMs':
      return t('performance.diagnosisWorker');
    case 'viewerIndexMs':
      return t('performance.diagnosisViewer');
    case 'readFileMs':
      return t('performance.diagnosisRead');
    case 'formatQueueMs':
      return t('performance.diagnosisQueue');
    default:
      return t('performance.diagnosisNone');
  }
}

export function buildPerformanceDiagnosticsSummary(
  snapshot: PerformanceSnapshot,
  history: PerformanceSnapshot[] = [],
  t: Translator = defaultT
) {
  const bottleneck = getPerformanceBottleneck(snapshot, t);
  const stageLines = performanceStageLabels.map(
    (stage) => `- ${t(stage.labelKey)}: ${formatPerformanceDuration(snapshot[stage.key])}`
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
    `trigger=${getPerformanceTriggerLabel(snapshot.trigger, t)}`,
    `status=${snapshot.status}`,
    `raw=${formatPerformanceBytes(snapshot.rawBytes)}`,
    `formatted=${formatPerformanceBytes(snapshot.formattedBytes)}`,
    `file=${formatPerformanceBytes(snapshot.fileSizeBytes)}`,
    `largeMode=${snapshot.largeMode ? 'on' : 'off'}`,
    `structureIndex=${snapshot.structureEnabled ? 'on' : 'off'}`,
    `total=${formatPerformanceDuration(snapshot.totalToFormattedMs)}`,
    `viewer=${formatPerformanceDuration(snapshot.totalToViewerReadyMs)}`,
    `bottleneck=${bottleneck.label} ${bottleneck.duration}`,
    `diagnosis=${getPerformanceDiagnosis(snapshot, t)}`,
    '[stages]',
    ...stageLines,
    ...(historyLines.length > 0 ? ['[recent]', ...historyLines] : []),
    snapshot.error ? `[error]\n${snapshot.error}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
