import React, { useEffect, useRef, useState } from 'react';
import { StructureStatus } from '../types/jsonTool';
import { createTranslator, type AppLanguage, type I18nKey } from '../utils/i18n';

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

type ToolbarOverflowAction = {
  disabled?: boolean;
  label: string;
  onSelect: () => void;
};

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
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement | null>(null);
  const hintMessage = getToolbarHintMessage({
    importingFileName,
    isLargeFileMode,
    isLargeFileLocateEnabled,
    canEnableLargeFileLocate,
    usesLightweightLocate,
    currentStructureStatus,
    t,
  });
  const overflowActions: ToolbarOverflowAction[] = [
    { label: t('toolbar.unescape'), onSelect: onUnescapeJson, disabled: !canEditJson },
    { label: t('toolbar.escape'), onSelect: onEscapeJson, disabled: !canEditJson },
    { label: t('toolbar.editJson'), onSelect: onEditJson, disabled: !canEditJson },
    { label: t('toolbar.compareJson'), onSelect: onOpenCompare, disabled: !canCompareJson },
    { label: t('toolbar.diagnostics'), onSelect: onOpenDiagnosticsLog },
    { label: t('toolbar.about'), onSelect: onOpenAbout },
    { label: t('toolbar.clear'), onSelect: onClear },
    { label: t('toolbar.foldAll'), onSelect: onFoldAll, disabled: !canControlRightPaneFolding },
    { label: t('toolbar.unfoldAll'), onSelect: onUnfoldAll, disabled: !canControlRightPaneFolding },
  ];

  useEffect(() => {
    if (!isMoreActionsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!moreActionsRef.current?.contains(event.target as Node)) {
        setIsMoreActionsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreActionsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isMoreActionsOpen]);

  const handleOverflowAction = (action: ToolbarOverflowAction) => {
    if (action.disabled) {
      return;
    }

    setIsMoreActionsOpen(false);
    action.onSelect();
  };

  return (
    <div className="toolbar">
      <div className="toolbar-layout">
        <div className="toolbar-top-row">
          <section className="toolbar-section toolbar-section-actions">
            <span className="toolbar-section-label">{t('toolbar.actions')}</span>
            <div className="toolbar-section-body toolbar-actions-layout">
              <div className="toolbar-actions-primary">
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
              <div className="toolbar-actions-secondary">
                <div className="toolbar-overflow" ref={moreActionsRef}>
                  <button
                    type="button"
                    className="toolbar-button-secondary"
                    aria-expanded={isMoreActionsOpen}
                    aria-haspopup="menu"
                    onClick={() => setIsMoreActionsOpen((current) => !current)}
                  >
                    {t('toolbar.moreActions')}
                  </button>
                  {isMoreActionsOpen && (
                    <div className="toolbar-overflow-menu" role="menu">
                      {overflowActions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          className="toolbar-button-secondary"
                          disabled={action.disabled}
                          role="menuitem"
                          onClick={() => handleOverflowAction(action)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="toolbar-bottom-row">
          <section className="toolbar-section toolbar-section-view">
            <span className="toolbar-section-label">{t('toolbar.view')}</span>
            <div className="toolbar-section-body toolbar-view-row">
              <label className="toolbar-checkbox">
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
              <button type="button" className="toolbar-button-secondary" onClick={onToggleDarkMode}>
                {isDarkMode ? t('toolbar.lightMode') : t('toolbar.darkMode')}
              </button>
              <button
                type="button"
                className="toolbar-button-secondary"
                onClick={() => onLanguageChange?.(language === 'zh' ? 'en' : 'zh')}
                aria-label={t('toolbar.language')}
              >
                {t('toolbar.languageToggle')}
              </button>
            </div>
          </section>
        </div>
      </div>

      {(processingStageText || hintMessage || currentError) && (
        <div className="toolbar-feedback">
          {processingStageText && <span className="toolbar-hint">{processingStageText}</span>}
          {hintMessage && <span className="toolbar-hint">{hintMessage}</span>}
          {currentError && <span className="toolbar-error">{currentError}</span>}
        </div>
      )}
    </div>
  );
};

export default JsonToolToolbar;
