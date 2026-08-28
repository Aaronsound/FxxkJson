import type React from 'react';
import { useRef } from 'react';
import { useModalFocusManagement } from '../hooks/useModalFocusManagement';
import { createTranslator, type I18nKey } from '../utils/i18n';

interface ArchitectureWarningDialogProps {
  isDarkMode: boolean;
  onClose: () => void;
  onOpenAbout: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const ArchitectureWarningDialog: React.FC<ArchitectureWarningDialogProps> = ({
  isDarkMode,
  onClose,
  onOpenAbout,
  t = defaultT,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusManagement(dialogRef, onClose);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="architecture-warning-title">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={
          isDarkMode ? 'modal-card modal-card-dark architecture-warning-card' : 'modal-card architecture-warning-card'
        }
      >
        <div className="modal-header about-dialog-header">
          <h3 id="architecture-warning-title">{t('architecture.title')}</h3>
          <button
            type="button"
            className="about-dialog-close"
            onClick={onClose}
            aria-label={t('architecture.closeLabel')}
          >
            ×
          </button>
        </div>
        <p className="architecture-warning-text">{t('architecture.message')}</p>
        <div className="modal-actions about-dialog-actions">
          <button type="button" onClick={onClose}>
            {t('architecture.dismiss')}
          </button>
          <button type="button" onClick={onOpenAbout}>
            {t('architecture.about')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchitectureWarningDialog;
