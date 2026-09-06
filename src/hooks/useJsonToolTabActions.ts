import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { PerformanceSnapshot, StructureStatus, Tab } from '../types/jsonTool';
import { createTab } from '../utils/jsonToolModels';
import { createClosedTabHistory, type ClosedTabSnapshot } from '../utils/closedTabHistory';

interface UseJsonToolTabActionsArgs {
  restoreTabContent: (tabId: string, snapshot: ClosedTabSnapshot) => Promise<void>;
  activeTabId: string;
  activeTabIdRef: MutableRefObject<string>;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  handleClear: () => void;
  initializeTabArtifacts: (tabId: string) => void;
  initializeTabState: (tabId: string) => void;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  leftEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  leftSearchWorkerRevisionRef: MutableRefObject<Record<string, number>>;
  leftViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  rawRevisionByTabRef: MutableRefObject<Record<string, number>>;
  removeTabArtifacts: (tabId: string) => void;
  removeTabArtifactsState: (tabId: string) => void;
  rightEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  rightViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  setActiveTabId: (tabId: string) => void;
  setPerformanceByTab: (
    updater: (current: Record<string, PerformanceSnapshot | null>) => Record<string, PerformanceSnapshot | null>
  ) => void;
  setTabs: (updater: (tabs: Tab[]) => Tab[]) => void;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
  tabs: Tab[];
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
}

export function useJsonToolTabActions({
  restoreTabContent,
  activeTabId,
  activeTabIdRef,
  formattedTextByTabRef,
  handleClear,
  initializeTabArtifacts,
  initializeTabState,
  largeFileLocateEnabledRef,
  largeModeRef,
  leftEditorRef,
  leftSearchWorkerRevisionRef,
  leftViewStateByTabRef,
  rawTextByTabRef,
  rawRevisionByTabRef,
  removeTabArtifacts,
  removeTabArtifactsState,
  rightEditorRef,
  rightViewStateByTabRef,
  setActiveTabId,
  setPerformanceByTab,
  setTabs,
  structureStatusRef,
  tabs,
  workerStructureEnabledRef,
}: UseJsonToolTabActionsArgs) {
  const handleClearRef = useRef(handleClear);
  handleClearRef.current = handleClear;
  const history = useRef(createClosedTabHistory());
  const [canReopenTab, setCanReopenTab] = useState(false);
  const pendingRestore = useRef<{ id: string; snapshot: ClosedTabSnapshot } | null>(null);
  const restoreRef = useRef(restoreTabContent);
  restoreRef.current = restoreTabContent;
  useEffect(() => {
    const pending = pendingRestore.current;
    if (!pending || !tabs.some((tab) => tab.id === pending.id)) return;
    pendingRestore.current = null;
    void restoreRef.current(pending.id, pending.snapshot);
  }, [tabs]);

  const addTab = useCallback(() => {
    const nextId = `tab-${crypto.randomUUID()}`;
    const currentTabId = activeTabIdRef.current;

    if (currentTabId) {
      leftViewStateByTabRef.current[currentTabId] =
        leftEditorRef.current?.saveViewState() ?? leftViewStateByTabRef.current[currentTabId] ?? null;
      rightViewStateByTabRef.current[currentTabId] =
        rightEditorRef.current?.saveViewState() ?? rightViewStateByTabRef.current[currentTabId] ?? null;
    }

    rawTextByTabRef.current[nextId] = '';
    rawRevisionByTabRef.current[nextId] = 0;
    formattedTextByTabRef.current[nextId] = '';
    initializeTabState(nextId);
    setPerformanceByTab((current) => ({ ...current, [nextId]: null }));
    initializeTabArtifacts(nextId);
    largeModeRef.current[nextId] = false;
    largeFileLocateEnabledRef.current[nextId] = false;
    structureStatusRef.current[nextId] = 'ready';
    workerStructureEnabledRef.current[nextId] = false;
    setTabs((currentTabs) => [...currentTabs, createTab(nextId)]);
    setActiveTabId(nextId);
    return nextId;
  }, [
    activeTabIdRef,
    formattedTextByTabRef,
    initializeTabArtifacts,
    initializeTabState,
    largeFileLocateEnabledRef,
    largeModeRef,
    leftEditorRef,
    leftViewStateByTabRef,
    rawRevisionByTabRef,
    rawTextByTabRef,
    rightEditorRef,
    rightViewStateByTabRef,
    setActiveTabId,
    setPerformanceByTab,
    setTabs,
    structureStatusRef,
    workerStructureEnabledRef,
  ]);

  const closeTab = useCallback(
    (tabId: string) => {
      const closingTab = tabs.find((tab) => tab.id === tabId);
      if (!closingTab) return;
      history.current.push({ title: closingTab.title, text: rawTextByTabRef.current[tabId] ?? '' });
      setCanReopenTab(history.current.size > 0);
      if (tabs.length === 1) {
        handleClearRef.current();
        return;
      }

      const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
      const fallbackTab = tabs[closingIndex === 0 ? 1 : closingIndex - 1];

      setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== tabId));
      delete leftSearchWorkerRevisionRef.current[tabId];
      removeTabArtifacts(tabId);
      removeTabArtifactsState(tabId);

      if (activeTabId === tabId) {
        setActiveTabId(fallbackTab.id);
      }
    },
    [
      activeTabId,
      leftSearchWorkerRevisionRef,
      removeTabArtifacts,
      removeTabArtifactsState,
      setActiveTabId,
      setTabs,
      tabs,
      rawTextByTabRef,
    ]
  );

  const reopenTab = useCallback(() => {
    if (pendingRestore.current) return;
    const snapshot = history.current.pop();
    if (!snapshot) return;
    const id = addTab();
    pendingRestore.current = { id, snapshot };
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, title: snapshot.title } : tab)));
    setCanReopenTab(history.current.size > 0);
  }, [addTab, setTabs]);

  return {
    addTab,
    closeTab,
    reopenTab,
    canReopenTab,
  };
}
