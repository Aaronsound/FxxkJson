import type { MutableRefObject } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { PerformanceSnapshot, StructureStatus, Tab } from '../types/jsonTool';
import { createTab } from '../utils/jsonToolModels';

interface UseJsonToolTabActionsArgs {
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
  const addTab = () => {
    const nextId = `tab-${Date.now()}`;
    const currentTabId = activeTabIdRef.current;

    if (currentTabId) {
      leftViewStateByTabRef.current[currentTabId] =
        leftEditorRef.current?.saveViewState() ?? leftViewStateByTabRef.current[currentTabId] ?? null;
      rightViewStateByTabRef.current[currentTabId] =
        rightEditorRef.current?.saveViewState() ?? rightViewStateByTabRef.current[currentTabId] ?? null;
    }

    rawTextByTabRef.current[nextId] = '';
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
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) {
      handleClear();
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
  };

  return {
    addTab,
    closeTab,
  };
}
