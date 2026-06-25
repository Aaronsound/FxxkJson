import { useCallback } from 'react';
import type { PerformanceTrigger } from '../types/jsonTool';
import { getUtf8ByteLength, isLargeDocument } from '../utils/jsonDocumentMetrics';

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
  updateTabContent: (tabId: string, content: string, syncModel?: boolean) => void;
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
      updateTabContent(tabId, updated, true);
      setTabLargeMode(tabId, isLargeDocument(updated));
    },
    [setTabLargeMode, updateTabContent]
  );

  const beginPastePerformanceSession = useCallback(
    (tabId: string, nextContent: string) => {
      beginPerformanceSession(
        tabId,
        'paste',
        '剪贴板粘贴',
        null,
        getUtf8ByteLength(nextContent),
        isLargeDocument(nextContent)
      );
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
