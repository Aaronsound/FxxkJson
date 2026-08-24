import { useCallback } from 'react';
import type { PerformanceTrigger } from '../types/jsonTool';
import { measureJsonDocument, shouldUseLargeModeForMetrics } from '../utils/jsonDocumentMetrics';

interface UseJsonToolWorkspaceActionsArgs {
  beginPerformanceSession: (
    tabId: string,
    trigger: PerformanceTrigger,
    sourceLabel: string,
    fileSizeBytes: number | null,
    rawBytes: number,
    largeMode: boolean
  ) => void;
  setIsAboutOpen: (open: boolean) => void;
  setIsCompareOpen: (open: boolean) => void;
  setIsDarkMode: (updater: (current: boolean) => boolean) => void;
  setIsDiagnosticsLogOpen: (open: boolean) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean, byteLength?: number) => void;
}

export function useJsonToolWorkspaceActions({
  beginPerformanceSession,
  setIsAboutOpen,
  setIsCompareOpen,
  setIsDarkMode,
  setIsDiagnosticsLogOpen,
  setTabLargeMode,
  updateTabContent,
}: UseJsonToolWorkspaceActionsArgs) {
  const applyRawUpdate = useCallback(
    (tabId: string, updated: string) => {
      const metrics = measureJsonDocument(updated);
      updateTabContent(tabId, updated, true, metrics.textByteLength);
      setTabLargeMode(tabId, shouldUseLargeModeForMetrics(metrics));
      return metrics;
    },
    [setTabLargeMode, updateTabContent]
  );

  const beginPastePerformanceSession = useCallback(
    (tabId: string, nextContent: string) => {
      const metrics = measureJsonDocument(nextContent);
      beginPerformanceSession(
        tabId,
        'paste',
        '剪贴板粘贴',
        null,
        metrics.textByteLength,
        shouldUseLargeModeForMetrics(metrics)
      );
      return metrics;
    },
    [beginPerformanceSession]
  );

  return {
    applyRawUpdate,
    beginPastePerformanceSession,
    handleOpenAbout: () => setIsAboutOpen(true),
    handleOpenCompare: () => setIsCompareOpen(true),
    handleOpenDiagnosticsLog: () => setIsDiagnosticsLogOpen(true),
    handleToggleDarkMode: () => setIsDarkMode((current: boolean) => !current),
  };
}
