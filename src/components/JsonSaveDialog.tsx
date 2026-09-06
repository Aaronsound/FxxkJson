import { useEffect, useRef, useState } from 'react';
import { useModalFocusManagement } from '../hooks/useModalFocusManagement';
import { createTranslator } from '../utils/i18n';

interface Props {
  raw: string;
  title: string;
  isDarkMode: boolean;
  onClose: () => void;
  t?: ReturnType<typeof createTranslator>;
}

export default function JsonSaveDialog({ raw, title, isDarkMode, onClose, t = createTranslator('zh') }: Props) {
  const [mode, setMode] = useState<'raw' | 'formatted' | 'compact'>('raw');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const mounted = useRef(true);
  useModalFocusManagement(dialogRef, () => {
    if (!busy) onClose();
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      workerRef.current?.terminate();
    };
  }, []);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!window.electronAPI?.saveJsonFile) throw new Error(t('save.desktopOnly'));
      let text = raw;
      if (mode !== 'raw') {
        text = await new Promise<string>((resolve, reject) => {
          const worker = new Worker(new URL('../workers/jsonExport.worker.ts', import.meta.url), { type: 'module' });
          workerRef.current = worker;
          worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; error?: string }>) => {
            worker.terminate();
            workerRef.current = null;
            if (event.data.buffer) resolve(new TextDecoder().decode(event.data.buffer));
            else reject(new Error(event.data.error ?? t('save.failed')));
          };
          worker.onerror = () => {
            worker.terminate();
            workerRef.current = null;
            reject(new Error(t('save.failed')));
          };
          worker.postMessage({ text: raw, mode });
        });
      }
      if (!mounted.current) return;
      const name = `${title.replace(/\.json$/i, '') || 'document'}-${mode}.json`;
      const saved = await window.electronAPI.saveJsonFile({ name, text });
      if (saved && mounted.current) onClose();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : t('save.failed'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="json-save-title">
      <div ref={dialogRef} tabIndex={-1} className={`modal-card json-save-card ${isDarkMode ? 'modal-card-dark' : ''}`}>
        <div className="modal-header">
          <h3 id="json-save-title">{t('save.title')}</h3>
        </div>
        <div className="modal-body">
          <p>{t('save.hint')}</p>
          <label>
            {t('save.content')}{' '}
            <select value={mode} disabled={busy} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="raw">{t('save.raw')}</option>
              <option value="formatted">{t('save.formatted')}</option>
              <option value="compact">{t('save.compact')}</option>
            </select>
          </label>
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
          {busy && <p role="status">{t('save.busy')}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="toolbar-button-primary" disabled={busy} onClick={() => void save()}>
            {t('save.choose')}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            {t('save.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
