import React, { useCallback, useEffect, useState } from 'react';

const LOG_PREVIEW_BYTES = 160 * 1024;
const ERROR_LINE_PATTERN = /("event"\s*:\s*"[^"]*(failed|error|gone|exception|rejection)|\b(failed|error|exception|rejection)\b|失败|异常)/i;

interface DiagnosticsLogPanelProps {
  isDarkMode: boolean;
  onClose: () => void;
}

function getErrorLines(content: string) {
  return content
    .split('\n')
    .filter((line) => ERROR_LINE_PATTERN.test(line))
    .join('\n');
}

function buildIssueSummary(snapshot: RuntimeLogSnapshot | null, content: string) {
  const path = snapshot?.path ?? 'runtime.log';
  const truncated = snapshot?.truncated ? 'yes' : 'no';

  return [
    `HanJson diagnostics summary`,
    `logPath=${path}`,
    `truncated=${truncated}`,
    '',
    content || '(no matching log lines)',
  ].join('\n');
}

const DiagnosticsLogPanel: React.FC<DiagnosticsLogPanelProps> = ({
  isDarkMode,
  onClose,
}) => {
  const [snapshot, setSnapshot] = useState<RuntimeLogSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

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

    await navigator.clipboard.writeText(content);
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
  const errorLogContent = getErrorLines(logContent);
  const displayContent = showErrorsOnly ? errorLogContent : logContent;
  const previewText = isLoading
    ? '正在读取日志...'
    : displayContent || (showErrorsOnly ? '没有匹配到错误日志' : '暂无日志');
  const metaText = [
    snapshot?.truncated ? '显示最近日志片段' : '显示完整日志',
    showErrorsOnly ? `错误行 ${errorLogContent ? errorLogContent.split('\n').length : 0}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="modal-overlay">
      <div className={isDarkMode ? 'modal-card modal-card-dark diagnostics-log-card' : 'modal-card diagnostics-log-card'}>
        <div className="modal-header diagnostics-log-header">
          <h3>诊断日志</h3>
          <span className="diagnostics-log-path">{snapshot?.path ?? 'runtime.log'}</span>
        </div>

        <div className="diagnostics-log-meta diagnostics-log-meta-row">
          <span>{metaText}</span>
          <label className="toolbar-checkbox diagnostics-log-filter">
            <input
              type="checkbox"
              checked={showErrorsOnly}
              onChange={(event) => setShowErrorsOnly(event.target.checked)}
            />
            只看错误
          </label>
        </div>

        <textarea
          className="diagnostics-log-output"
          readOnly
          value={previewText}
          spellCheck={false}
        />

        <div className="modal-actions">
          <button onClick={loadLog} disabled={isLoading}>刷新</button>
          <button
            onClick={() => copyLog(displayContent, '已复制当前内容')}
            disabled={!displayContent}
          >
            复制当前内容
          </button>
          <button
            onClick={() => copyLog(buildIssueSummary(snapshot, displayContent), '已复制问题摘要')}
            disabled={!logContent}
          >
            复制问题摘要
          </button>
          <button onClick={clearLog} disabled={isLoading}>清空日志</button>
          <button onClick={showLogFile}>定位文件</button>
          <button onClick={onClose}>关闭</button>
          {copyNotice && <span className="modal-copy-hint">{copyNotice}</span>}
        </div>

        {error && <div className="modal-error">{error}</div>}
      </div>
    </div>
  );
};

export default DiagnosticsLogPanel;
