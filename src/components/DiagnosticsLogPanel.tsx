import React, { useCallback, useEffect, useState } from 'react';
import { getDiagnosticsLogLineCategory } from '../utils/diagnosticsLogLevel';

const LOG_PREVIEW_BYTES = 160 * 1024;
type DiagnosticsLogFilter = 'all' | 'error' | 'warn' | 'performance';

interface DiagnosticsLogPanelProps {
  isDarkMode: boolean;
  context?: DiagnosticsContextItem[];
  onClose: () => void;
}

export interface DiagnosticsContextItem {
  label: string;
  value: string | number | boolean | null | undefined;
}

function getFilteredLines(content: string, filter: DiagnosticsLogFilter) {
  if (filter === 'all') {
    return content;
  }

  return content
    .split('\n')
    .filter((line) => getDiagnosticsLogLineCategory(line) === filter)
    .join('\n');
}

function formatContextValue(value: DiagnosticsContextItem['value']) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return '(none)';
  }

  return String(value);
}

function buildIssueSummary(
  snapshot: RuntimeLogSnapshot | null,
  content: string,
  context: DiagnosticsContextItem[] = []
) {
  const path = snapshot?.path ?? 'runtime.log';
  const truncated = snapshot?.truncated ? 'yes' : 'no';
  const contextLines =
    context.length > 0
      ? context.map((item) => `${item.label}=${formatContextValue(item.value)}`).join('\n')
      : '(no app context)';

  return [
    `FxxkJson diagnostics summary`,
    `logPath=${path}`,
    `truncated=${truncated}`,
    '',
    '[app-context]',
    contextLines,
    '',
    '[log-excerpt]',
    content || '(no matching log lines)',
  ].join('\n');
}

function getContextSummary(context: DiagnosticsContextItem[]) {
  if (context.length === 0) {
    return null;
  }

  const tabTitle = context.find((item) => item.label === 'tabTitle')?.value;
  const rawBytes = context.find((item) => item.label === 'rawBytes')?.value;
  const status = context.find((item) => item.label === 'performanceStatus')?.value;

  return [
    tabTitle ? `标签 ${tabTitle}` : null,
    typeof rawBytes === 'number' ? `原始 ${rawBytes.toLocaleString()} bytes` : null,
    status ? `状态 ${status}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function countLines(content: string) {
  return content ? content.split('\n').length : 0;
}

async function writeDiagnosticsTextToClipboard(content: string) {
  if (window.electronAPI?.writeClipboardText) {
    await window.electronAPI.writeClipboardText(content);
    return;
  }

  await navigator.clipboard.writeText(content);
}

const DiagnosticsLogPanel: React.FC<DiagnosticsLogPanelProps> = ({ isDarkMode, context = [], onClose }) => {
  const [snapshot, setSnapshot] = useState<RuntimeLogSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<DiagnosticsLogFilter>('all');

  const loadLog = useCallback(async () => {
    if (!window.electronAPI?.readRecentLog) {
      setSnapshot(null);
      setError('当前环境没有可用的桌面日志接口');
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
  }, []);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);

    return () => {
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose]);

  const copyLog = async (content: string, notice: string) => {
    if (!content) {
      return;
    }

    await writeDiagnosticsTextToClipboard(content);
    setCopyNotice(notice);
  };

  const clearLog = async () => {
    if (!window.electronAPI?.clearLog) {
      setError('当前环境没有可用的桌面日志接口');
      return;
    }

    try {
      const path = await window.electronAPI.clearLog();
      setSnapshot({ path, content: '', truncated: false });
      setLogFilter('all');
      setCopyNotice('日志已清空');
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const showLogFile = async () => {
    if (!window.electronAPI?.showLogFile) {
      setError('当前环境没有可用的桌面日志接口');
      return;
    }

    try {
      await window.electronAPI.showLogFile();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  const logContent = snapshot?.content ?? '';
  const errorLogContent = getFilteredLines(logContent, 'error');
  const warnLogContent = getFilteredLines(logContent, 'warn');
  const performanceLogContent = getFilteredLines(logContent, 'performance');
  const displayContent = getFilteredLines(logContent, logFilter);
  const contextSummary = getContextSummary(context);
  const emptyFilterText =
    logFilter === 'error'
      ? '没有匹配到错误日志'
      : logFilter === 'warn'
        ? '没有匹配到警告日志'
        : logFilter === 'performance'
          ? '没有匹配到性能日志'
          : '暂无日志';
  const previewText = isLoading ? '正在读取日志...' : displayContent || emptyFilterText;
  const metaText = [
    snapshot?.truncated ? '显示最近日志片段' : '显示完整日志',
    `日志行 ${countLines(logContent)}`,
    `错误 ${countLines(errorLogContent)}`,
    `警告 ${countLines(warnLogContent)}`,
    `性能 ${countLines(performanceLogContent)}`,
    contextSummary,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="modal-overlay">
      <div
        className={isDarkMode ? 'modal-card modal-card-dark diagnostics-log-card' : 'modal-card diagnostics-log-card'}
      >
        <div className="modal-header diagnostics-log-header">
          <h3>诊断日志</h3>
          <span className="diagnostics-log-path">{snapshot?.path ?? 'runtime.log'}</span>
        </div>

        <div className="diagnostics-log-meta diagnostics-log-meta-row">
          <span>{metaText}</span>
          <label className="diagnostics-log-filter">
            日志筛选
            <select
              aria-label="日志筛选"
              value={logFilter}
              onChange={(event) => setLogFilter(event.target.value as DiagnosticsLogFilter)}
            >
              <option value="all">全部</option>
              <option value="error">错误</option>
              <option value="warn">警告</option>
              <option value="performance">性能</option>
            </select>
          </label>
        </div>

        <textarea className="diagnostics-log-output" readOnly value={previewText} spellCheck={false} />

        <div className="modal-actions">
          <button type="button" onClick={loadLog} disabled={isLoading}>
            刷新
          </button>
          <button type="button" onClick={() => copyLog(displayContent, '已复制当前内容')} disabled={!displayContent}>
            复制当前内容
          </button>
          <button
            type="button"
            onClick={() => copyLog(buildIssueSummary(snapshot, displayContent, context), '已复制诊断包')}
            disabled={!logContent && context.length === 0}
          >
            复制诊断包
          </button>
          <button type="button" onClick={clearLog} disabled={isLoading}>
            清空日志
          </button>
          <button type="button" onClick={showLogFile}>
            定位文件
          </button>
          <button type="button" onClick={onClose}>
            关闭
          </button>
          {copyNotice && <span className="modal-copy-hint">{copyNotice}</span>}
        </div>

        {error && <div className="modal-error">{error}</div>}
      </div>
    </div>
  );
};

export default DiagnosticsLogPanel;
