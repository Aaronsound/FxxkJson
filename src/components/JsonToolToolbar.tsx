import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StructureStatus } from '../types/jsonTool';
import type { AppAccentTheme } from '../utils/accentTheme';
import { type AppLanguage, createTranslator, type I18nKey } from '../utils/i18n';

export interface JsonToolToolbarProps {
  onImport: () => void;
  onFormat: () => void;
  onRepairJson: () => void;
  onUnescapeJson: () => void;
  onEscapeJson: () => void;
  onClear: () => void;
  onEditJson: () => void;
  onOpenCompare: () => void;
  onOpenDiagnosticsLog: () => void;
  onOpenAbout: () => void;
  onFoldAll: () => void;
  onUnfoldAll: () => void;
  canControlRightPaneFolding: boolean;
  isLargeFileMode: boolean;
  canEditJson: boolean;
  canCompareJson: boolean;
  wrapLongLines: boolean;
  onWrapLongLinesChange: (checked: boolean) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isLargeFileLocateEnabled: boolean;
  onLargeFileLocateToggle: (checked: boolean) => void;
  showPerformancePanel: boolean;
  onShowPerformancePanelChange: (checked: boolean) => void;
  importingFileName: string | null;
  canEnableLargeFileLocate: boolean;
  usesLightweightLocate: boolean;
  currentStructureStatus: StructureStatus;
  processingStageText: string | null;
  currentError: string | null;
  accentTheme?: AppAccentTheme;
  onAccentThemeChange?: (theme: AppAccentTheme) => void;
  language?: AppLanguage;
  onLanguageChange?: (language: AppLanguage) => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');
const accentThemeOptions: Array<{ color: string; labelKey: I18nKey; value: AppAccentTheme }> = [
  { value: 'emerald', labelKey: 'toolbar.themeEmerald', color: '#238b59' },
  { value: 'mist', labelKey: 'toolbar.themeMist', color: '#507a89' },
  { value: 'graphite', labelKey: 'toolbar.themeGraphite', color: '#66717c' },
  { value: 'obsidian', labelKey: 'toolbar.themeObsidian', color: '#252b31' },
  { value: 'blue', labelKey: 'toolbar.themeBlue', color: '#2563eb' },
  { value: 'indigo', labelKey: 'toolbar.themeIndigo', color: '#4f46e5' },
  { value: 'violet', labelKey: 'toolbar.themeViolet', color: '#7c3aed' },
];

function getToolbarHintMessage({
  importingFileName,
  isLargeFileMode,
  isLargeFileLocateEnabled,
  canEnableLargeFileLocate,
  usesLightweightLocate,
  currentStructureStatus,
  t,
}: Pick<
  JsonToolToolbarProps,
  | 'importingFileName'
  | 'isLargeFileMode'
  | 'isLargeFileLocateEnabled'
  | 'canEnableLargeFileLocate'
  | 'usesLightweightLocate'
  | 'currentStructureStatus'
> & {
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
}) {
  if (importingFileName) {
    return t('toolbar.importing', { fileName: importingFileName });
  }

  if (!isLargeFileMode && !isLargeFileLocateEnabled) {
    return null;
  }

  if (!isLargeFileMode) {
    return t('toolbar.locatePreset');
  }

  if (!canEnableLargeFileLocate) {
    return t('toolbar.noLocateContent');
  }

  if (usesLightweightLocate) {
    if (!isLargeFileLocateEnabled) {
      return t('toolbar.lightweightLocateOff');
    }

    if (currentStructureStatus === 'building') {
      return t('toolbar.lightweightLocateBuilding');
    }

    if (currentStructureStatus === 'ready') {
      return t('toolbar.lightweightLocateReady');
    }

    return t('toolbar.lightweightLocateDisabled');
  }

  if (!isLargeFileLocateEnabled) {
    return t('toolbar.largeLocateOff');
  }

  if (currentStructureStatus === 'building') {
    return t('toolbar.largeLocateBuilding');
  }

  if (currentStructureStatus === 'disabled') {
    return t('toolbar.largeLocateDisabled');
  }

  return t('toolbar.largeLocateReady');
}

type JsonToolToolbarFeedbackProps = Pick<
  JsonToolToolbarProps,
  | 'canEnableLargeFileLocate'
  | 'currentError'
  | 'currentStructureStatus'
  | 'importingFileName'
  | 'isLargeFileLocateEnabled'
  | 'isLargeFileMode'
  | 'onOpenDiagnosticsLog'
  | 'processingStageText'
  | 't'
  | 'usesLightweightLocate'
>;

export const JsonToolToolbarFeedback: React.FC<JsonToolToolbarFeedbackProps> = ({
  canEnableLargeFileLocate,
  currentError,
  currentStructureStatus,
  importingFileName,
  isLargeFileLocateEnabled,
  isLargeFileMode,
  onOpenDiagnosticsLog,
  processingStageText,
  t = defaultT,
  usesLightweightLocate,
}) => {
  const hintMessage = getToolbarHintMessage({
    importingFileName,
    isLargeFileMode,
    isLargeFileLocateEnabled,
    canEnableLargeFileLocate,
    usesLightweightLocate,
    currentStructureStatus,
    t,
  });

  if (!processingStageText && !hintMessage && !currentError) {
    return null;
  }

  return (
    <div className="toolbar-feedback-region">
      <div
        className={`toolbar-feedback ${currentError ? 'toolbar-feedback-error' : ''}`}
        role={currentError ? 'alert' : 'status'}
        aria-live={currentError ? 'assertive' : 'polite'}
        aria-label={t('toolbar.status')}
      >
        <span className="toolbar-feedback-mark" aria-hidden="true">
          {currentError ? '!' : processingStageText ? '…' : 'i'}
        </span>
        <div className="toolbar-feedback-content">
          {processingStageText && (
            <span className="toolbar-hint" title={processingStageText}>
              {processingStageText}
            </span>
          )}
          {hintMessage && (
            <span className="toolbar-hint" title={hintMessage}>
              {hintMessage}
            </span>
          )}
          {currentError && (
            <span className="toolbar-error" title={currentError}>
              {currentError}
            </span>
          )}
        </div>
        {currentError && (
          <button type="button" className="toolbar-feedback-action" onClick={onOpenDiagnosticsLog}>
            {t('toolbar.diagnostics')}
          </button>
        )}
      </div>
    </div>
  );
};

const JsonToolToolbar: React.FC<JsonToolToolbarProps> = ({
  onImport,
  onFormat,
  onRepairJson,
  onUnescapeJson,
  onEscapeJson,
  onClear,
  onEditJson,
  onOpenCompare,
  onOpenDiagnosticsLog,
  onOpenAbout,
  onFoldAll,
  onUnfoldAll,
  canControlRightPaneFolding,
  isLargeFileMode,
  canEditJson,
  canCompareJson,
  wrapLongLines,
  onWrapLongLinesChange,
  isDarkMode,
  onToggleDarkMode,
  isLargeFileLocateEnabled,
  onLargeFileLocateToggle,
  showPerformancePanel,
  onShowPerformancePanelChange,
  canEnableLargeFileLocate,
  accentTheme = 'emerald',
  onAccentThemeChange,
  language = 'zh',
  onLanguageChange,
  t = defaultT,
}) => {
  const moreMenuRef = useRef<HTMLDetailsElement | null>(null);
  const accentThemeMenuRef = useRef<HTMLDetailsElement | null>(null);
  const languageMenuRef = useRef<HTMLDetailsElement | null>(null);
  const [isCompactToolbar, setIsCompactToolbar] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 860px)').matches
  );
  const closeMoreMenu = useCallback(() => {
    accentThemeMenuRef.current?.removeAttribute('open');
    languageMenuRef.current?.removeAttribute('open');
    moreMenuRef.current?.removeAttribute('open');
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const menu = moreMenuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        closeMoreMenu();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      const menu = moreMenuRef.current;
      if (event.key !== 'Escape' || !menu?.open) return;
      event.preventDefault();
      event.stopPropagation();
      closeMoreMenu();
      menu.querySelector<HTMLElement>('.toolbar-more-trigger')?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [closeMoreMenu]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 860px)');
    const updateCompactToolbar = () => setIsCompactToolbar(query.matches);
    updateCompactToolbar();
    query.addEventListener('change', updateCompactToolbar);
    window.addEventListener('resize', updateCompactToolbar);
    return () => {
      query.removeEventListener('change', updateCompactToolbar);
      window.removeEventListener('resize', updateCompactToolbar);
    };
  }, []);
  return (
    <div className="toolbar">
      <div className="toolbar-layout">
        <div className="toolbar-command-row" aria-label={t('toolbar.actions')}>
          <div className="toolbar-command-group toolbar-command-group-primary">
            <button type="button" className="toolbar-button-primary" onClick={onImport}>
              {t('toolbar.import')}
            </button>
            <button type="button" className="toolbar-button-primary" onClick={onFormat}>
              {t('toolbar.format')}
            </button>
            <button type="button" className="toolbar-button-primary" onClick={onRepairJson} disabled={!canEditJson}>
              {t('toolbar.repair')}
            </button>
          </div>

          <div className="toolbar-command-divider" aria-hidden="true" />

          <div className="toolbar-command-group toolbar-command-group-secondary">
            <button type="button" className="toolbar-button-secondary" onClick={onUnescapeJson} disabled={!canEditJson}>
              {t('toolbar.unescape')}
            </button>
            <button type="button" className="toolbar-button-secondary" onClick={onEscapeJson} disabled={!canEditJson}>
              {t('toolbar.escape')}
            </button>
            <button type="button" className="toolbar-button-secondary" onClick={onEditJson} disabled={!canEditJson}>
              {t('toolbar.editJson')}
            </button>
            <button
              type="button"
              className="toolbar-button-secondary"
              onClick={onOpenCompare}
              disabled={!canCompareJson}
            >
              {t('toolbar.compareJson')}
            </button>
          </div>

          <div className="toolbar-command-spacer" />

          <div className="toolbar-command-group toolbar-command-group-document">
            <button
              type="button"
              className="toolbar-button-quiet toolbar-document-action"
              onClick={onFoldAll}
              disabled={!canControlRightPaneFolding}
            >
              {t('toolbar.foldAll')}
            </button>
            <button
              type="button"
              className="toolbar-button-quiet toolbar-document-action"
              onClick={onUnfoldAll}
              disabled={!canControlRightPaneFolding}
            >
              {t('toolbar.unfoldAll')}
            </button>
            <button type="button" className="toolbar-button-quiet toolbar-document-action" onClick={onClear}>
              {t('toolbar.clear')}
            </button>

            <details
              ref={moreMenuRef}
              className="toolbar-more-menu"
              onToggle={(event) => {
                if (!event.currentTarget.open) languageMenuRef.current?.removeAttribute('open');
              }}
            >
              <summary className="toolbar-more-trigger">{t('toolbar.more')}</summary>
              <div className="toolbar-more-popover">
                {isCompactToolbar && (
                  <div className="toolbar-more-compact-actions">
                    <div className="toolbar-more-section">
                      <div className="toolbar-more-section-label">{t('toolbar.moreContentActions')}</div>
                      <div className="toolbar-more-section-actions">
                        <button
                          type="button"
                          onClick={() => {
                            closeMoreMenu();
                            onUnescapeJson();
                          }}
                          disabled={!canEditJson}
                        >
                          {t('toolbar.unescape')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeMoreMenu();
                            onEscapeJson();
                          }}
                          disabled={!canEditJson}
                        >
                          {t('toolbar.escape')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeMoreMenu();
                            onEditJson();
                          }}
                          disabled={!canEditJson}
                        >
                          {t('toolbar.editJson')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeMoreMenu();
                            onOpenCompare();
                          }}
                          disabled={!canCompareJson}
                        >
                          {t('toolbar.compareJson')}
                        </button>
                      </div>
                    </div>
                    <div className="toolbar-more-section">
                      <div className="toolbar-more-section-label">{t('toolbar.moreDocumentActions')}</div>
                      <div className="toolbar-more-section-actions">
                        <button
                          type="button"
                          onClick={() => {
                            closeMoreMenu();
                            onFoldAll();
                          }}
                          disabled={!canControlRightPaneFolding}
                        >
                          {t('toolbar.foldAll')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeMoreMenu();
                            onUnfoldAll();
                          }}
                          disabled={!canControlRightPaneFolding}
                        >
                          {t('toolbar.unfoldAll')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeMoreMenu();
                            onClear();
                          }}
                        >
                          {t('toolbar.clear')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="toolbar-more-section">
                  <div className="toolbar-more-section-actions">
                    <button
                      type="button"
                      onClick={() => {
                        closeMoreMenu();
                        onOpenDiagnosticsLog();
                      }}
                    >
                      {t('toolbar.diagnostics')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeMoreMenu();
                        onToggleDarkMode();
                      }}
                    >
                      {isDarkMode ? t('toolbar.lightMode') : t('toolbar.darkMode')}
                    </button>
                    <details
                      ref={accentThemeMenuRef}
                      className="toolbar-language-menu toolbar-theme-menu"
                      onToggle={(event) => {
                        if (event.currentTarget.open) languageMenuRef.current?.removeAttribute('open');
                      }}
                    >
                      <summary className="toolbar-language-trigger">{t('toolbar.themeColor')}</summary>
                      <div
                        className="toolbar-language-options toolbar-theme-options"
                        role="radiogroup"
                        aria-label={t('toolbar.themeColor')}
                      >
                        {accentThemeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={accentTheme === option.value}
                            className={`toolbar-language-option toolbar-theme-option ${
                              accentTheme === option.value ? 'is-selected' : ''
                            }`}
                            data-accent-theme-option={option.value}
                            onClick={() => {
                              closeMoreMenu();
                              if (accentTheme !== option.value) onAccentThemeChange?.(option.value);
                            }}
                          >
                            <span className="toolbar-language-check" aria-hidden="true">
                              {accentTheme === option.value ? '✓' : ''}
                            </span>
                            <span
                              className="toolbar-theme-swatch"
                              style={{ backgroundColor: option.color }}
                              aria-hidden="true"
                            />
                            {t(option.labelKey)}
                          </button>
                        ))}
                      </div>
                    </details>
                    <details
                      ref={languageMenuRef}
                      className="toolbar-language-menu"
                      onToggle={(event) => {
                        if (event.currentTarget.open) accentThemeMenuRef.current?.removeAttribute('open');
                      }}
                    >
                      <summary className="toolbar-language-trigger">{t('toolbar.language')}</summary>
                      <div className="toolbar-language-options" role="radiogroup" aria-label={t('toolbar.language')}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={language === 'zh'}
                          className={
                            language === 'zh' ? 'toolbar-language-option is-selected' : 'toolbar-language-option'
                          }
                          onClick={() => {
                            closeMoreMenu();
                            if (language !== 'zh') onLanguageChange?.('zh');
                          }}
                        >
                          <span className="toolbar-language-check" aria-hidden="true">
                            {language === 'zh' ? '✓' : ''}
                          </span>
                          {t('toolbar.languageChinese')}
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={language === 'en'}
                          className={
                            language === 'en' ? 'toolbar-language-option is-selected' : 'toolbar-language-option'
                          }
                          onClick={() => {
                            closeMoreMenu();
                            if (language !== 'en') onLanguageChange?.('en');
                          }}
                        >
                          <span className="toolbar-language-check" aria-hidden="true">
                            {language === 'en' ? '✓' : ''}
                          </span>
                          {t('toolbar.languageEnglish')}
                        </button>
                      </div>
                    </details>
                    <button
                      type="button"
                      className="toolbar-more-about"
                      onClick={() => {
                        closeMoreMenu();
                        onOpenAbout();
                      }}
                    >
                      {t('toolbar.about')}
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="toolbar-view-row" aria-label={t('toolbar.view')}>
          <div className="toolbar-view-controls">
            <label className="toolbar-checkbox" title={t('toolbar.wrapHint')}>
              <input
                type="checkbox"
                checked={wrapLongLines}
                onChange={(event) => onWrapLongLinesChange(event.target.checked)}
              />
              <span className="toolbar-checkbox-control" aria-hidden="true" />
              {t('toolbar.wrap')}
            </label>
            <label className="toolbar-checkbox">
              <input
                type="checkbox"
                checked={isLargeFileLocateEnabled}
                disabled={isLargeFileMode && !canEnableLargeFileLocate}
                onChange={(event) => onLargeFileLocateToggle(event.target.checked)}
              />
              <span className="toolbar-checkbox-control" aria-hidden="true" />
              {t('toolbar.largeLocate')}
            </label>
            <label className="toolbar-checkbox">
              <input
                type="checkbox"
                checked={showPerformancePanel}
                onChange={(event) => onShowPerformancePanelChange(event.target.checked)}
              />
              <span className="toolbar-checkbox-control" aria-hidden="true" />
              {t('toolbar.performance')}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JsonToolToolbar;
