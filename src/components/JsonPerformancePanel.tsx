import type React from 'react';
import { useMemo, useState } from 'react';
import type { PerformanceSnapshot } from '../types/jsonTool';
import { type AppLanguage, createTranslator, type I18nKey } from '../utils/i18n';
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
import OperationNotice from './OperationNotice';

interface JsonPerformancePanelProps {
  snapshot: PerformanceSnapshot | null;
  history?: PerformanceSnapshot[];
  isDarkMode: boolean;
  language?: AppLanguage;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

function getStatusLabel(
  snapshot: PerformanceSnapshot,
  t: (key: I18nKey, params?: Record<string, string | number>) => string
) {
  if (snapshot.status === 'failed') {
    return t('performance.statusFailed');
  }

  if (snapshot.status === 'running') {
    return t('performance.statusRunning');
  }

  return t('performance.statusReady');
}

const JsonPerformancePanel: React.FC<JsonPerformancePanelProps> = ({
  snapshot,
  history = [],
  isDarkMode,
  language = 'zh',
  t = defaultT,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const bottleneck = useMemo(
    () => (snapshot ? getPerformanceBottleneck(snapshot, t) : { key: null, label: '--', duration: '--' }),
    [snapshot, t]
  );
  const diagnosis = useMemo(() => (snapshot ? getPerformanceDiagnosis(snapshot, t) : ''), [snapshot, t]);
  const diagnosticsSummary = useMemo(
    () => (snapshot ? buildPerformanceDiagnosticsSummary(snapshot, history, t) : ''),
    [history, snapshot, t]
  );

  return (
    <aside
      className={[
        'performance-panel',
        isDarkMode ? 'performance-panel-dark' : '',
        expanded ? 'performance-panel-expanded' : 'performance-panel-collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="performance-panel-topbar">
        <div className="performance-panel-title-block">
          <strong>{t('performance.title')}</strong>
          <span className="performance-panel-status-chip">
            {snapshot ? getStatusLabel(snapshot, t) : t('performance.waiting')}
          </span>
        </div>
        <div className="performance-panel-compact">
          {snapshot ? (
            <>
              <span>{getPerformanceTriggerLabel(snapshot.trigger, t)}</span>
              <span>Viewer {formatPerformanceDuration(snapshot.totalToViewerReadyMs)}</span>
              <span>{t('performance.total', { value: formatPerformanceDuration(snapshot.totalToFormattedMs) })}</span>
              <span>{t('performance.bottleneck', { value: bottleneck.label })}</span>
            </>
          ) : (
            <span>{t('performance.waitingHint')}</span>
          )}
        </div>
        <button
          type="button"
          className="performance-toggle-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t('performance.collapse') : t('performance.expand')}
        </button>
      </div>

      {expanded && snapshot && (
        <div className="performance-panel-body">
          <div className="performance-panel-header">
            <div>
              <span className="performance-panel-subtitle">{snapshot.sourceLabel}</span>
            </div>
            <div className="performance-panel-status">
              <span>
                {new Date(snapshot.updatedAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
                  hour12: false,
                })}
              </span>
              <button
                type="button"
                className="performance-copy-button"
                onClick={async () => {
                  await writeTextToClipboard(diagnosticsSummary);
                  setCopyNotice(t('performance.copiedSummary'));
                  window.setTimeout(() => setCopyNotice(null), 1600);
                }}
              >
                {t('performance.copySummary')}
              </button>
            </div>
          </div>

          <div className="performance-summary-grid">
            <div className="performance-card">
              <span className="performance-card-label">{t('performance.rawSize')}</span>
              <strong>{formatPerformanceBytes(snapshot.rawBytes)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">{t('performance.formattedSize')}</span>
              <strong>{formatPerformanceBytes(snapshot.formattedBytes)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">{t('performance.totalTime')}</span>
              <strong>{formatPerformanceDuration(snapshot.totalToFormattedMs)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">Viewer</span>
              <strong>{formatPerformanceDuration(snapshot.totalToViewerReadyMs)}</strong>
            </div>
            <div className="performance-card">
              <span className="performance-card-label">{t('performance.primaryBottleneck')}</span>
              <strong>{`${bottleneck.label} (${bottleneck.duration})`}</strong>
            </div>
          </div>

          <div className="performance-diagnosis">{diagnosis}</div>

          <div className="performance-stage-grid">
            {performanceStageLabels.map((stage) => (
              <div key={stage.key} className="performance-stage-row">
                <span>{t(stage.labelKey)}</span>
                <strong>{formatPerformanceDuration(snapshot[stage.key])}</strong>
              </div>
            ))}
          </div>

          {history.length > 0 && (
            <div className="performance-history">
              <div className="performance-history-title">{t('performance.recent')}</div>
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
            <span>
              {t('performance.fileSize', {
                value: snapshot.fileSizeBytes ? formatPerformanceBytes(snapshot.fileSizeBytes) : '--',
              })}
            </span>
            <span>
              {t('performance.largeMode', { value: t(snapshot.largeMode ? 'performance.on' : 'performance.off') })}
            </span>
            <span>
              {t('performance.structureIndex', {
                value: t(snapshot.structureEnabled ? 'performance.enabled' : 'performance.disabled'),
              })}
            </span>
            {copyNotice && <OperationNotice>{copyNotice}</OperationNotice>}
          </div>

          {snapshot.error && <div className="performance-error">{snapshot.error}</div>}
        </div>
      )}
    </aside>
  );
};

export default JsonPerformancePanel;
