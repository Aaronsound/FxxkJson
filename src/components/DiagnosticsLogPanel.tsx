import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalFocusManagement } from '../hooks/useModalFocusManagement';
import { createTranslator, type I18nKey } from '../utils/i18n';
import {
  buildDiagnosticsIssueSummary,
  buildDiagnosticsLogViewState,
  type DiagnosticsContextItem,
  type DiagnosticsLogFilter,
} from '../utils/diagnosticsLogView';
import OperationNotice from './OperationNotice';

const LOG_PREVIEW_BYTES = 160 * 1024;

interface DiagnosticsLogPanelProps {
  isDarkMode: boolean;
  context?: DiagnosticsContextItem[];
  onClose: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

async function writeDiagnosticsTextToClipboard(content: string) {
  if (window.electronAPI?.writeClipboardText) {
    await window.electronAPI.writeClipboardText(content);
    return;
  }

  await navigator.clipboard.writeText(content);
}

const DiagnosticsLogPanel: React.FC<DiagnosticsLogPanelProps> = ({
  isDarkMode,
  context = [],
  onClose,
  t = defaultT,
}) => {
  const [snapshot, setSnapshot] = useState<RuntimeLogSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<DiagnosticsLogFilter>('all');
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusManagement(dialogRef, onClose);

  const loadLog = useCallback(async () => {
    if (!window.electronAPI?.readRecentLog) {
      setSnapshot(null);
      setError(t('diagnostics.unavailable'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCopyNotice(null);

    try {
      setSnapshot(await window.electronAPI.readRecentLog(LOG_PREVIEW_BYTES));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const copyLog = async (content: string, notice: string) => {
    if (!content) {
      return;
    }

    await writeDiagnosticsTextToClipboard(content);
    setCopyNotice(notice);
  };

  const clearLog = async () => {
    if (!window.electronAPI?.clearLog) {
      setError(t('diagnostics.unavailable'));
      return;
    }

    try {
      const path = await window.electronAPI.clearLog();
      setSnapshot({ path, content: '', truncated: false });
      setLogFilter('all');
      setCopyNotice(t('diagnostics.cleared'));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const showLogFile = async () => {
    if (!window.electronAPI?.showLogFile) {
      setError(t('diagnostics.unavailable'));
      return;
    }

    try {
      await window.electronAPI.showLogFile();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const logContent = snapshot?.content ?? '';
  const { displayContent, metaText, previewText } = buildDiagnosticsLogViewState(
    {
      context,
      filter: logFilter,
      isLoading,
      logContent,
      snapshot,
    },
    t
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="diagnostics-log-title">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={isDarkMode ? 'modal-card modal-card-dark diagnostics-log-card' : 'modal-card diagnostics-log-card'}
      >
        <div className="modal-header diagnostics-log-header">
          <h3 id="diagnostics-log-title">{t('diagnostics.title')}</h3>
          <span className="diagnostics-log-path">{snapshot?.path ?? 'runtime.log'}</span>
          <button
            type="button"
            className="about-dialog-close"
            onClick={onClose}
            aria-label={t('diagnostics.closeLabel')}
          >
            ×
          </button>
        </div>

        <div className="diagnostics-log-meta diagnostics-log-meta-row">
          <span>{metaText}</span>
          <label className="diagnostics-log-filter">
            {t('diagnostics.filter')}
            <select
              aria-label={t('diagnostics.filter')}
              value={logFilter}
              onChange={(event) => setLogFilter(event.target.value as DiagnosticsLogFilter)}
            >
              <option value="all">{t('diagnostics.filterAll')}</option>
              <option value="error">{t('diagnostics.filterError')}</option>
              <option value="warn">{t('diagnostics.filterWarn')}</option>
              <option value="performance">{t('diagnostics.filterPerformance')}</option>
            </select>
          </label>
        </div>

        <textarea className="diagnostics-log-output" readOnly value={previewText} spellCheck={false} />

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" onClick={loadLog} disabled={isLoading}>
            {t('diagnostics.refresh')}
          </button>
          <button
            type="button"
            onClick={() => copyLog(displayContent, t('diagnostics.copiedCurrent'))}
            disabled={!displayContent}
          >
            {t('diagnostics.copyCurrent')}
          </button>
          <button
            type="button"
            onClick={() =>
              copyLog(buildDiagnosticsIssueSummary(snapshot, displayContent, context), t('diagnostics.copiedBundle'))
            }
            disabled={!logContent && context.length === 0}
          >
            {t('diagnostics.copyBundle')}
          </button>
          <button type="button" onClick={clearLog} disabled={isLoading}>
            {t('diagnostics.clear')}
          </button>
          <button type="button" onClick={showLogFile}>
            {t('diagnostics.showFile')}
          </button>
          <button type="button" onClick={onClose}>
            {t('diagnostics.close')}
          </button>
          {copyNotice && <OperationNotice>{copyNotice}</OperationNotice>}
        </div>
      </div>
    </div>
  );
};

export default DiagnosticsLogPanel;
export type { DiagnosticsContextItem };
