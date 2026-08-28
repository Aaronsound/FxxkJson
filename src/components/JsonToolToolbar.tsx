import type React from 'react';
import { useRef } from 'react';
import type { StructureStatus } from '../types/jsonTool';
import { type AppLanguage, createTranslator, type I18nKey } from '../utils/i18n';

interface JsonToolToolbarProps {
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
  language?: AppLanguage;
  onLanguageChange?: (language: AppLanguage) => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

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
  importingFileName,
  canEnableLargeFileLocate,
  usesLightweightLocate,
  currentStructureStatus,
  processingStageText,
  currentError,
  language = 'zh',
  onLanguageChange,
  t = defaultT,
}) => {
  const moreMenuRef = useRef<HTMLDetailsElement | null>(null);
  const hintMessage = getToolbarHintMessage({
    importingFileName,
    isLargeFileMode,
    isLargeFileLocateEnabled,
    canEnableLargeFileLocate,
    usesLightweightLocate,
    currentStructureStatus,
    t,
  });

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
              className="toolbar-button-quiet"
              onClick={onFoldAll}
              disabled={!canControlRightPaneFolding}
            >
              {t('toolbar.foldAll')}
            </button>
            <button
              type="button"
              className="toolbar-button-quiet"
              onClick={onUnfoldAll}
              disabled={!canControlRightPaneFolding}
            >
              {t('toolbar.unfoldAll')}
            </button>
            <button type="button" className="toolbar-button-quiet" onClick={onClear}>
              {t('toolbar.clear')}
            </button>

            <details ref={moreMenuRef} className="toolbar-more-menu">
              <summary className="toolbar-more-trigger">{t('toolbar.more')}</summary>
              <div className="toolbar-more-popover">
                <button
                  type="button"
                  onClick={() => {
                    moreMenuRef.current?.removeAttribute('open');
                    onOpenDiagnosticsLog();
                  }}
                >
                  {t('toolbar.diagnostics')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    moreMenuRef.current?.removeAttribute('open');
                    onOpenAbout();
                  }}
                >
                  {t('toolbar.about')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    moreMenuRef.current?.removeAttribute('open');
                    onToggleDarkMode();
                  }}
                >
                  {isDarkMode ? t('toolbar.lightMode') : t('toolbar.darkMode')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    moreMenuRef.current?.removeAttribute('open');
                    onLanguageChange?.(language === 'zh' ? 'en' : 'zh');
                  }}
                  aria-label={t('toolbar.language')}
                >
                  {t('toolbar.languageToggle')}
                </button>
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
              {t('toolbar.wrap')}
            </label>
            <label className="toolbar-checkbox">
              <input
                type="checkbox"
                checked={isLargeFileLocateEnabled}
                disabled={isLargeFileMode && !canEnableLargeFileLocate}
                onChange={(event) => onLargeFileLocateToggle(event.target.checked)}
              />
              {t('toolbar.largeLocate')}
            </label>
            <label className="toolbar-checkbox">
              <input
                type="checkbox"
                checked={showPerformancePanel}
                onChange={(event) => onShowPerformancePanelChange(event.target.checked)}
              />
              {t('toolbar.performance')}
            </label>
          </div>

          {(processingStageText || hintMessage || currentError) && (
            <div className="toolbar-feedback" aria-live="polite">
              {processingStageText && <span className="toolbar-hint">{processingStageText}</span>}
              {hintMessage && <span className="toolbar-hint">{hintMessage}</span>}
              {currentError && <span className="toolbar-error">{currentError}</span>}
              {currentError && (
                <button type="button" className="toolbar-feedback-action" onClick={onOpenDiagnosticsLog}>
                  {t('toolbar.diagnostics')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JsonToolToolbar;
