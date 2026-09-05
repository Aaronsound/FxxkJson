import { useCallback, useState } from 'react';
import {
  DEFAULT_TAB_TITLE,
  EMPTY_DOCUMENT_META,
  type RenamingTabState,
  type StructureStatus,
  type Tab,
  type TabDocumentMeta,
} from '../types/jsonTool';
import { createTab } from '../utils/jsonToolModels';
import type { JsonErrorLocation } from '../utils/jsonErrorLocation';

interface UseJsonToolTabsStateOptions {
  initialTabId: string;
  initialTabTitle: string;
}

export function useJsonToolTabsState({ initialTabId, initialTabTitle }: UseJsonToolTabsStateOptions) {
  const [tabs, setTabs] = useState<Tab[]>([createTab(initialTabId, initialTabTitle)]);
  const [activeTabId, setActiveTabId] = useState(initialTabId);
  const [renamingTab, setRenamingTab] = useState<RenamingTabState | null>(null);
  const [documentMetaByTab, setDocumentMetaByTab] = useState<Record<string, TabDocumentMeta>>({
    [initialTabId]: EMPTY_DOCUMENT_META,
  });
  const [errorsByTab, setErrorsByTab] = useState<Record<string, string | null>>({
    [initialTabId]: null,
  });
  const [errorLocationsByTab, setErrorLocationsByTab] = useState<Record<string, JsonErrorLocation>>({});
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

  const setTabError = useCallback((tabId: string, message: string | null, location?: JsonErrorLocation) => {
    setErrorsByTab((current) => ({ ...current, [tabId]: message }));
    setErrorLocationsByTab((current) => {
      if (message && location) return { ...current, [tabId]: location };
      if (!current[tabId]) return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  }, []);

  const setTabImporting = useCallback((tabId: string, fileName: string | null) => {
    setImportingByTab((current) => ({ ...current, [tabId]: fileName }));
  }, []);

  const setTabFormatting = useCallback((tabId: string, formatting: boolean) => {
    setIsFormattingByTab((current) => ({ ...current, [tabId]: formatting }));
  }, []);

  const setTabLargeModeState = useCallback((tabId: string, enabled: boolean) => {
    setLargeModeByTab((current) => ({ ...current, [tabId]: enabled }));
  }, []);

  const setLargeFileLocateEnabledState = useCallback((tabId: string, enabled: boolean) => {
    setLargeFileLocateEnabledByTab((current) => ({ ...current, [tabId]: enabled }));
  }, []);

  const setStructureStatusState = useCallback((tabId: string, status: StructureStatus) => {
    setStructureStatusByTab((current) => ({ ...current, [tabId]: status }));
  }, []);

  const setDocumentMeta = useCallback((tabId: string, updater: (current: TabDocumentMeta) => TabDocumentMeta) => {
    setDocumentMetaByTab((current) => ({
      ...current,
      [tabId]: updater(current[tabId] ?? EMPTY_DOCUMENT_META),
    }));
  }, []);

  const renameTab = useCallback((tabId: string, nextTitle: string) => {
    const trimmedTitle = nextTitle.trim() || DEFAULT_TAB_TITLE;
    setTabs((currentTabs) => currentTabs.map((tab) => (tab.id === tabId ? { ...tab, title: trimmedTitle } : tab)));
  }, []);

  const startRenamingTab = useCallback((tab: Tab) => {
    setRenamingTab({ id: tab.id, value: tab.title });
  }, []);

  const handleRenamingChange = useCallback((value: string) => {
    setRenamingTab((current) => (current ? { ...current, value } : current));
  }, []);

  const finishRenaming = useCallback(() => {
    if (!renamingTab) {
      return;
    }

    renameTab(renamingTab.id, renamingTab.value);
    setRenamingTab(null);
  }, [renameTab, renamingTab]);

  const cancelRenaming = useCallback(() => {
    setRenamingTab(null);
  }, []);

  const initializeTabState = useCallback((tabId: string) => {
    setDocumentMetaByTab((current) => ({ ...current, [tabId]: EMPTY_DOCUMENT_META }));
    setErrorsByTab((current) => ({ ...current, [tabId]: null }));
    setImportingByTab((current) => ({ ...current, [tabId]: null }));
    setIsFormattingByTab((current) => ({ ...current, [tabId]: false }));
    setLargeModeByTab((current) => ({ ...current, [tabId]: false }));
    setLargeFileLocateEnabledByTab((current) => ({ ...current, [tabId]: false }));
    setStructureStatusByTab((current) => ({ ...current, [tabId]: 'ready' }));
  }, []);

  const removeTabState = useCallback((tabId: string) => {
    setErrorLocationsByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
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
  }, []);

  return {
    activeTabId,
    cancelRenaming,
    documentMetaByTab,
    errorsByTab,
    errorLocationsByTab,
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
