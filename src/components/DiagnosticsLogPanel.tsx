import React, { useCallback, useEffect, useState } from 'react';

const LOG_PREVIEW_BYTES = 160 * 1024;

interface DiagnosticsLogPanelProps {
  isDarkMode: boolean;
  onClose: () => void;
}

const DiagnosticsLogPanel: React.FC<DiagnosticsLogPanelProps> = ({
  isDarkMode,
  onClose,
}) => {
  const [snapshot, setSnapshot] = useState<RuntimeLogSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

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

  const copyLog = async () => {
    const content = snapshot?.content ?? '';
    if (!content) {
      return;
    }

    await navigator.clipboard.writeText(content);
    setCopyNotice('已复制日志');
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
  const previewText = isLoading
    ? '正在读取日志...'
    : logContent || '暂无日志';

  return (
    <div className="modal-overlay">
      <div className={isDarkMode ? 'modal-card modal-card-dark diagnostics-log-card' : 'modal-card diagnostics-log-card'}>
        <div className="modal-header diagnostics-log-header">
          <h3>诊断日志</h3>
          <span className="diagnostics-log-path">{snapshot?.path ?? 'runtime.log'}</span>
        </div>

        <div className="diagnostics-log-meta">
          {snapshot?.truncated ? '显示最近日志片段' : '显示完整日志'}
        </div>

        <textarea
          className="diagnostics-log-output"
          readOnly
          value={previewText}
          spellCheck={false}
        />

        <div className="modal-actions">
          <button onClick={loadLog} disabled={isLoading}>刷新</button>
          <button onClick={copyLog} disabled={!logContent}>复制</button>
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
