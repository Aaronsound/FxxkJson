import React, { useEffect, useRef } from 'react';
import { RenamingTabState, Tab } from '../types/jsonTool';

interface JsonToolTabBarProps {
  tabs: Tab[];
  activeTabId: string;
  renamingTab: RenamingTabState | null;
  onSelectTab: (tabId: string) => void;
  onStartRenaming: (tab: Tab) => void;
  onRenamingChange: (value: string) => void;
  onFinishRenaming: () => void;
  onCancelRenaming: () => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
}

const JsonToolTabBar: React.FC<JsonToolTabBarProps> = ({
  tabs,
  activeTabId,
  renamingTab,
  onSelectTab,
  onStartRenaming,
  onRenamingChange,
  onFinishRenaming,
  onCancelRenaming,
  onCloseTab,
  onAddTab,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const correctionTimersRef = useRef<number[]>([]);
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTabId);

  useEffect(() => {
    const clearCorrectionTimers = () => {
      correctionTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      correctionTimersRef.current = [];
    };

    const ensureActiveTabVisible = () => {
      const container = containerRef.current;
      const activeTab = tabRefs.current[activeTabId];
      if (!container || !activeTab) {
        return;
      }

      if (tabs.length <= 1 || activeTabIndex <= 0) {
        container.scrollLeft = 0;
        return;
      }

      const maxScrollableLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      if (container.scrollWidth <= container.clientWidth + 1) {
        container.scrollLeft = 0;
        return;
      }

      const tabLeft = activeTab.offsetLeft;
      const tabRight = tabLeft + activeTab.offsetWidth;
      const visibleLeft = container.scrollLeft;
      const visibleRight = visibleLeft + container.clientWidth;
      const gap = 8;

      if (tabLeft <= gap) {
        container.scrollLeft = 0;
        return;
      }

      if (activeTab.offsetWidth >= container.clientWidth - gap * 2) {
        container.scrollLeft = Math.min(Math.max(0, tabLeft - gap), maxScrollableLeft);
        return;
      }

      if (tabLeft < visibleLeft) {
        container.scrollLeft = Math.min(Math.max(0, tabLeft - gap), maxScrollableLeft);
        return;
      }

      if (tabRight > visibleRight) {
        container.scrollLeft = Math.min(
          Math.max(0, tabRight - container.clientWidth + gap),
          maxScrollableLeft
        );
      }
    };

    const scheduleEnsureActiveTabVisible = () => {
      clearCorrectionTimers();

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(ensureActiveTabVisible);
      });

      [0, 60, 180, 320].forEach((delay) => {
        const timerId = window.setTimeout(ensureActiveTabVisible, delay);
        correctionTimersRef.current.push(timerId);
      });
    };

    const container = containerRef.current;
    const observer = container ? new ResizeObserver(scheduleEnsureActiveTabVisible) : null;
    observer?.observe(container);

    const frameId = window.requestAnimationFrame(scheduleEnsureActiveTabVisible);
    window.addEventListener('resize', scheduleEnsureActiveTabVisible);
    document.addEventListener('fullscreenchange', scheduleEnsureActiveTabVisible);

    return () => {
      observer?.disconnect();
      clearCorrectionTimers();
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', scheduleEnsureActiveTabVisible);
      document.removeEventListener('fullscreenchange', scheduleEnsureActiveTabVisible);
    };
  }, [activeTabId, activeTabIndex, tabs.length]);

  return (
    <div ref={containerRef} className="tab-bar">
      {tabs.map((tab) => {
        const isRenaming = renamingTab?.id === tab.id;

        return (
          <div
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            className={tab.id === activeTabId ? 'tab active' : 'tab'}
            onClick={() => onSelectTab(tab.id)}
            onDoubleClick={() => onStartRenaming(tab)}
            onContextMenu={(event) => {
              event.preventDefault();
              onStartRenaming(tab);
            }}
          >
            {isRenaming ? (
              <input
                className="tab-rename-input"
                autoFocus
                value={renamingTab.value}
                onChange={(event) => onRenamingChange(event.target.value)}
                onBlur={onFinishRenaming}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onFinishRenaming();
                  } else if (event.key === 'Escape') {
                    onCancelRenaming();
                  }
                }}
              />
            ) : (
              <>
                <span className="tab-title" title={tab.title}>
                  {tab.title}
                </span>
                <button
                  type="button"
                  className="tab-close"
                  aria-label={`close ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  x
                </button>
              </>
            )}
          </div>
        );
      })}
      <button type="button" className="add-tab" onClick={onAddTab}>+</button>
    </div>
  );
};

export default JsonToolTabBar;
