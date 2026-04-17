import { useState } from 'react';
import {
  DEFAULT_TAB_TITLE,
  EMPTY_DOCUMENT_META,
  RenamingTabState,
  StructureStatus,
  Tab,
  TabDocumentMeta,
} from '../types/jsonTool';
import { createTab } from '../utils/jsonToolModels';

interface UseJsonToolTabsStateOptions {
  initialTabId: string;
  initialTabTitle: string;
}

export function useJsonToolTabsState({
  initialTabId,
  initialTabTitle,
}: UseJsonToolTabsStateOptions) {
  const [tabs, setTabs] = useState<Tab[]>([createTab(initialTabId, initialTabTitle)]);
  const [activeTabId, setActiveTabId] = useState(initialTabId);
  const [renamingTab, setRenamingTab] = useState<RenamingTabState | null>(null);
  const [documentMetaByTab, setDocumentMetaByTab] = useState<Record<string, TabDocumentMeta>>({
    [initialTabId]: EMPTY_DOCUMENT_META,
  });
  const [errorsByTab, setErrorsByTab] = useState<Record<string, string | null>>({
    [initialTabId]: null,
  });
  const [importingByTab, setImportingByTab] = useState<Record<string, string | null>>({
    [initialTabId]: null,
  });
  const [isFormattingByTab, setIsFormattingByTab] = useState<Record<string, boolean>>({
    [initialTabId]: false,
  });
  const [largeModeByTab, setLargeModeByTab] = useState<Record<string, boolean>>({
    [initialTabId]: false,
  });
  const [largeFileLocateEnabledByTab, setLargeFileLocateEnabledByTab] = useState<Record<string, boolean>>({
    [initialTabId]: false,
  });
  const [structureStatusByTab, setStructureStatusByTab] = useState<Record<string, StructureStatus>>({
    [initialTabId]: 'ready',
  });

  const setTabError = (tabId: string, message: string | null) => {
    setErrorsByTab((current) => ({ ...current, [tabId]: message }));
  };

  const setTabImporting = (tabId: string, fileName: string | null) => {
    setImportingByTab((current) => ({ ...current, [tabId]: fileName }));
  };

  const setTabFormatting = (tabId: string, formatting: boolean) => {
    setIsFormattingByTab((current) => ({ ...current, [tabId]: formatting }));
  };

  const setTabLargeModeState = (tabId: string, enabled: boolean) => {
    setLargeModeByTab((current) => ({ ...current, [tabId]: enabled }));
  };

  const setLargeFileLocateEnabledState = (tabId: string, enabled: boolean) => {
    setLargeFileLocateEnabledByTab((current) => ({ ...current, [tabId]: enabled }));
  };

  const setStructureStatusState = (tabId: string, status: StructureStatus) => {
    setStructureStatusByTab((current) => ({ ...current, [tabId]: status }));
  };

  const setDocumentMeta = (
    tabId: string,
    updater: (current: TabDocumentMeta) => TabDocumentMeta
  ) => {
    setDocumentMetaByTab((current) => ({
      ...current,
      [tabId]: updater(current[tabId] ?? EMPTY_DOCUMENT_META),
    }));
  };

  const renameTab = (tabId: string, nextTitle: string) => {
    const trimmedTitle = nextTitle.trim() || DEFAULT_TAB_TITLE;
    setTabs((currentTabs) => (
      currentTabs.map((tab) => (
        tab.id === tabId
          ? { ...tab, title: trimmedTitle }
          : tab
      ))
    ));
  };

  const startRenamingTab = (tab: Tab) => {
    setRenamingTab({ id: tab.id, value: tab.title });
  };

  const handleRenamingChange = (value: string) => {
    setRenamingTab((current) => (current ? { ...current, value } : current));
  };

  const finishRenaming = () => {
    if (!renamingTab) {
      return;
    }

    renameTab(renamingTab.id, renamingTab.value);
    setRenamingTab(null);
  };

  const cancelRenaming = () => {
    setRenamingTab(null);
  };

  const initializeTabState = (tabId: string) => {
    setDocumentMetaByTab((current) => ({ ...current, [tabId]: EMPTY_DOCUMENT_META }));
    setErrorsByTab((current) => ({ ...current, [tabId]: null }));
    setImportingByTab((current) => ({ ...current, [tabId]: null }));
    setIsFormattingByTab((current) => ({ ...current, [tabId]: false }));
    setLargeModeByTab((current) => ({ ...current, [tabId]: false }));
    setLargeFileLocateEnabledByTab((current) => ({ ...current, [tabId]: false }));
    setStructureStatusByTab((current) => ({ ...current, [tabId]: 'ready' }));
  };

  const removeTabState = (tabId: string) => {
    setErrorsByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setImportingByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setIsFormattingByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setDocumentMetaByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setLargeModeByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setLargeFileLocateEnabledByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setStructureStatusByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  return {
    activeTabId,
    cancelRenaming,
    documentMetaByTab,
    errorsByTab,
    finishRenaming,
    handleRenamingChange,
    importingByTab,
    initializeTabState,
    isFormattingByTab,
    largeFileLocateEnabledByTab,
    largeModeByTab,
    removeTabState,
    renameTab,
    renamingTab,
    setActiveTabId,
    setDocumentMeta,
    setTabError,
    setTabFormatting,
    setTabImporting,
    setTabLargeModeState,
    setLargeFileLocateEnabledState,
    setStructureStatusState,
    setTabs,
    startRenamingTab,
    structureStatusByTab,
    tabs,
  };
}
