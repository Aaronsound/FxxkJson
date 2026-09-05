import type React from 'react';
import { lazy, Suspense } from 'react';
import ArchitectureWarningDialog from './ArchitectureWarningDialog';
import type { EditJsonSession } from '../hooks/useJsonEditSession';
import type { Tab } from '../types/jsonTool';
import type { I18nKey } from '../utils/i18n';
import type { JsonErrorLocation } from '../utils/jsonErrorLocation';

const AboutDialog = lazy(() => import('./AboutDialog'));
const DiagnosticsLogPanel = lazy(() => import('./DiagnosticsLogPanel'));
const JsonCompareDialog = lazy(() => import('./JsonCompareDialog'));
const JsonEditModal = lazy(() => import('./JsonEditModal'));
const RightNodeMutationDialog = lazy(() => import('./RightNodeMutationDialog'));

interface JsonToolOverlayLayerProps {
  activeTabId: string;
  diagnosticsContext: React.ComponentProps<typeof DiagnosticsLogPanel>['context'];
  editJsonBusyLabel: string | null;
  editJsonError: string | null;
  editJsonErrorLocation?: JsonErrorLocation;
  editJsonSession: EditJsonSession | null;
  getTabText: (tabId: string) => string;
  hasCopiedLiteral: boolean;
  isAboutOpen: boolean;
  isArchitectureWarningDismissed: boolean;
  isCompareOpen: boolean;
  isDarkMode: boolean;
  isDiagnosticsLogOpen: boolean;
  isDragImportActive: boolean;
  onCancelMutationDialog: () => void;
  onCloseAbout: () => void;
  onCloseCompare: () => void;
  onCloseDiagnosticsLog: () => void;
  onCloseEditJson: () => void;
  onConfirmDeleteMutationDialog: () => void;
  onConfirmRenameMutationDialog: (nextKey: string) => void;
  onCopyEscapedJson: () => void;
  onDismissArchitectureWarning: () => void;
  onEditJsonValueChange: (value: string) => void;
  onEscapeEditJsonContent: (value: string) => Promise<string>;
  onOpenAbout: () => void;
  onSaveEditJson: () => void;
  onUnescapeEditJsonContent: (value: string) => Promise<string>;
  rightNodeMutationDialog: React.ComponentProps<typeof RightNodeMutationDialog>['state'] | null;
  runtimeInfo: RuntimeAppInfo | null;
  tabs: Tab[];
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
  version: string;
}

const JsonToolOverlayLayer: React.FC<JsonToolOverlayLayerProps> = ({
  activeTabId,
  diagnosticsContext,
  editJsonBusyLabel,
  editJsonError,
  editJsonErrorLocation,
  editJsonSession,
  getTabText,
  hasCopiedLiteral,
  isAboutOpen,
  isArchitectureWarningDismissed,
  isCompareOpen,
  isDarkMode,
  isDiagnosticsLogOpen,
  isDragImportActive,
  onCancelMutationDialog,
  onCloseAbout,
  onCloseCompare,
  onCloseDiagnosticsLog,
  onCloseEditJson,
  onConfirmDeleteMutationDialog,
  onConfirmRenameMutationDialog,
  onCopyEscapedJson,
  onDismissArchitectureWarning,
  onEditJsonValueChange,
  onEscapeEditJsonContent,
  onOpenAbout,
  onSaveEditJson,
  onUnescapeEditJsonContent,
  rightNodeMutationDialog,
  runtimeInfo,
  tabs,
  t,
  version,
}) => (
  <>
    {isDragImportActive && (
      <div className="drag-import-overlay">
        <div className={`drag-import-panel ${isDarkMode ? 'dark' : ''}`}>
          <span className="drag-import-title">{t('drag.title')}</span>
          <span className="drag-import-subtitle">{t('drag.subtitle')}</span>
        </div>
      </div>
    )}

    {runtimeInfo?.isMacTranslated && !isArchitectureWarningDismissed && (
      <ArchitectureWarningDialog
        isDarkMode={isDarkMode}
        onClose={onDismissArchitectureWarning}
        onOpenAbout={() => {
          onDismissArchitectureWarning();
          onOpenAbout();
        }}
        t={t}
      />
    )}

    <Suspense fallback={null}>
      {editJsonSession && (
        <JsonEditModal
          sessionKey={editJsonSession.key}
          initialValue={editJsonSession.initialValue}
          isDarkMode={isDarkMode}
          error={editJsonError}
          errorLocation={editJsonErrorLocation}
          busyLabel={editJsonBusyLabel}
          hasCopiedLiteral={hasCopiedLiteral}
          title={editJsonSession.mode === 'node' ? t('edit.nodeTitle') : t('edit.title')}
          pathText={editJsonSession.pathText}
          saveLabel={editJsonSession.mode === 'node' ? t('edit.saveNode') : t('edit.saveJson')}
          onValueChange={onEditJsonValueChange}
          onSave={onSaveEditJson}
          onUnescapeContent={onUnescapeEditJsonContent}
          onEscapeContent={onEscapeEditJsonContent}
          onCopyLiteral={onCopyEscapedJson}
          onClose={onCloseEditJson}
          t={t}
        />
      )}

      {rightNodeMutationDialog && (
        <RightNodeMutationDialog
          state={rightNodeMutationDialog}
          isDarkMode={isDarkMode}
          onCancel={onCancelMutationDialog}
          onConfirmDelete={onConfirmDeleteMutationDialog}
          onConfirmRename={onConfirmRenameMutationDialog}
          t={t}
        />
      )}

      {isDiagnosticsLogOpen && (
        <DiagnosticsLogPanel
          isDarkMode={isDarkMode}
          context={diagnosticsContext}
          onClose={onCloseDiagnosticsLog}
          t={t}
        />
      )}

      {isCompareOpen && (
        <JsonCompareDialog
          tabs={tabs}
          activeTabId={activeTabId}
          isDarkMode={isDarkMode}
          getTabText={getTabText}
          onClose={onCloseCompare}
          t={t}
        />
      )}

      {isAboutOpen && (
        <AboutDialog version={version} isDarkMode={isDarkMode} runtimeInfo={runtimeInfo} onClose={onCloseAbout} t={t} />
      )}
    </Suspense>
  </>
);

export default JsonToolOverlayLayer;
