import { useEffect, useRef, useState } from 'react';
import { Tab } from '../types/app';

export type RenamingTab = {
  id: string;
  value: string;
};

type UseTabsOptions = {
  initialTabs: Tab[];
  initialActiveTabId: string;
};

type CloseTabResult = {
  closed: boolean;
};

/**
 * 标签管理 Hook：封装标签的增删改查与重命名交互状态。
 */
export function useTabs({ initialTabs, initialActiveTabId }: UseTabsOptions) {
  const [tabs, setTabs] = useState<Tab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState(initialActiveTabId);
  const [renamingTab, setRenamingTab] = useState<RenamingTab | null>(null);
  const activeTabIdRef = useRef(initialActiveTabId);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const updateTabContent = (tabId: string, content: string) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, content } : tab)));
  };

  const renameTab = (tabId: string, newTitle: string) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, title: newTitle } : tab)));
  };

  const addTab = () => {
    const newTabId = `tab-${Date.now()}`;
    setTabs((prev) => [...prev, { id: newTabId, title: 'newTab', content: '' }]);
    setActiveTabId(newTabId);
    return newTabId;
  };

  const closeTab = (tabId: string): CloseTabResult => {
    let closed = false;

    setTabs((prev) => {
      if (!prev.some((tab) => tab.id === tabId)) {
        return prev;
      }

      // 当只剩一个标签时，允许关闭到 0 个标签
      if (prev.length <= 1) {
        setActiveTabId('');
        closed = true;
        return [];
      }

      const idx = prev.findIndex((tab) => tab.id === tabId);
      const nextTabs = prev.filter((tab) => tab.id !== tabId);

      if (tabId === activeTabIdRef.current) {
        const fallbackIdx = Math.max(0, idx - 1);
        setActiveTabId(nextTabs[fallbackIdx].id);
      }

      closed = true;
      return nextTabs;
    });

    if (renamingTab?.id === tabId) {
      setRenamingTab(null);
    }

    if (!closed) {
      return { closed: false };
    }
    return { closed: true };
  };

  const startRenaming = (tabId: string, currentTitle: string) => {
    setRenamingTab({ id: tabId, value: currentTitle });
  };

  const finishRenaming = () => {
    if (!renamingTab) return;

    const nextTitle = renamingTab.value.trim() || 'newTab';
    renameTab(renamingTab.id, nextTitle);
    setRenamingTab(null);
  };

  const cancelRenaming = () => {
    setRenamingTab(null);
  };

  return {
    tabs,
    activeTabId,
    renamingTab,
    setActiveTabId,
    setRenamingTab,
    updateTabContent,
    renameTab,
    addTab,
    closeTab,
    startRenaming,
    finishRenaming,
    cancelRenaming,
  };
}
