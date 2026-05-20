import React, { useEffect } from 'react';
import { createTranslator, type I18nKey } from '../utils/i18n';

interface AboutDialogProps {
  version: string;
  isDarkMode: boolean;
  runtimeInfo?: RuntimeAppInfo | null;
  onClose: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const FEATURE_ITEMS = [
  'about.feature.largeJson',
  'about.feature.rightView',
  'about.feature.editing',
  'about.feature.diagnostics',
] as const;

const AboutDialog: React.FC<AboutDialogProps> = ({
  version,
  isDarkMode,
  runtimeInfo = null,
  onClose,
  t = defaultT,
}) => {
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

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
      <div className={isDarkMode ? 'modal-card modal-card-dark about-dialog-card' : 'modal-card about-dialog-card'}>
        <div className="modal-header about-dialog-header">
          <h3 id="about-dialog-title">{t('about.title')}</h3>
          <button type="button" className="about-dialog-close" onClick={onClose} aria-label={t('about.closeLabel')}>
            ×
          </button>
        </div>

        <dl className="about-dialog-meta">
          <div>
            <dt>{t('about.name')}</dt>
            <dd>FxxkJson</dd>
          </div>
          <div>
            <dt>{t('about.version')}</dt>
            <dd>{version}</dd>
          </div>
          <div>
            <dt>{t('about.arch')}</dt>
            <dd>
              {runtimeInfo
                ? `${runtimeInfo.arch}${runtimeInfo.isMacTranslated ? t('about.rosetta') : ''}`
                : t('about.unknown')}
            </dd>
          </div>
          <div>
            <dt>{t('about.author')}</dt>
            <dd>Alosan</dd>
          </div>
          <div>
            <dt>{t('about.email')}</dt>
            <dd>
              <a href="mailto:hanwalter@163.com">hanwalter@163.com</a>
            </dd>
          </div>
        </dl>

        {runtimeInfo?.isMacTranslated && (
          <div className="about-dialog-warning" role="alert">
            {t('about.warning')}
          </div>
        )}

        <section className="about-dialog-section" aria-labelledby="about-feature-title">
          <h4 id="about-feature-title">{t('about.features')}</h4>
          <ul>
            {FEATURE_ITEMS.map((item) => (
              <li key={item}>{t(item)}</li>
            ))}
          </ul>
        </section>

        <div className="modal-actions about-dialog-actions">
          <button type="button" onClick={onClose}>{t('about.close')}</button>
        </div>
      </div>
    </div>
  );
};

export default AboutDialog;
