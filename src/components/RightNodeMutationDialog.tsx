import React, { useEffect, useState } from 'react';
import { createTranslator, type I18nKey } from '../utils/i18n';

export type RightNodeMutationDialogState =
  | {
      mode: 'delete';
      pathText: string;
      preview: string;
    }
  | {
      mode: 'rename';
      currentKey: string;
      pathText: string;
    };

interface RightNodeMutationDialogProps {
  state: RightNodeMutationDialogState;
  isDarkMode: boolean;
  onCancel: () => void;
  onConfirmDelete: () => void;
  onConfirmRename: (nextKey: string) => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const RightNodeMutationDialog: React.FC<RightNodeMutationDialogProps> = ({
  state,
  isDarkMode,
  onCancel,
  onConfirmDelete,
  onConfirmRename,
  t = defaultT,
}) => {
  const [nextKey, setNextKey] = useState(state.mode === 'rename' ? state.currentKey : '');

  useEffect(() => {
    setNextKey(state.mode === 'rename' ? state.currentKey : '');
  }, [state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  const isRename = state.mode === 'rename';
  const title = isRename ? t('mutation.renameTitle') : t('mutation.deleteTitle');
  const canSubmitRename = nextKey.trim().length > 0;
  const hasOuterWhitespace = isRename && nextKey.length !== nextKey.trim().length;
  const renameWarning = isRename
    ? [
      hasOuterWhitespace ? t('mutation.whitespaceWarning') : null,
      nextKey !== state.currentKey ? t('mutation.duplicateWarning') : null,
    ].filter(Boolean).join(' ')
    : '';

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="right-node-mutation-title"
    >
      <div className={isDarkMode ? 'modal-card modal-card-dark right-node-mutation-card' : 'modal-card right-node-mutation-card'}>
        <div className="modal-header">
          <h3 id="right-node-mutation-title">{title}</h3>
        </div>

        <div className="right-node-mutation-body">
          <div className="modal-path" title={state.pathText}>{state.pathText}</div>
          {isRename ? (
            <label className="right-node-mutation-field">
              <span>{t('mutation.newKey')}</span>
              <input
                autoFocus
                value={nextKey}
                onChange={(event) => setNextKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSubmitRename) {
                    onConfirmRename(nextKey);
                  }
                  if (event.key === 'Escape') {
                    onCancel();
                  }
                }}
              />
              {renameWarning && (
                <span className="right-node-mutation-warning">{renameWarning}</span>
              )}
            </label>
          ) : (
            <>
              <p className="right-node-mutation-message">
                {t('mutation.deleteMessage')}
              </p>
              <pre className="right-node-mutation-preview">{state.preview}</pre>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>{t('mutation.cancel')}</button>
          {isRename ? (
            <button type="button" onClick={() => onConfirmRename(nextKey)} disabled={!canSubmitRename}>
              {t('mutation.confirmRename')}
            </button>
          ) : (
            <button type="button" className="danger-button" onClick={onConfirmDelete}>
              {t('mutation.confirmDelete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RightNodeMutationDialog;
