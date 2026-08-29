import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { RenamingTabState, Tab } from '../types/jsonTool';
import { createTranslator, type I18nKey } from '../utils/i18n';

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
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

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
  t = defaultT,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const correctionTimersRef = useRef<number[]>([]);
  const [scrollState, setScrollState] = useState({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTabId);

  useEffect(() => {
    const container = containerRef.current;

    const clearCorrectionTimers = () => {
      correctionTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      correctionTimersRef.current = [];
    };

    const updateScrollState = () => {
      if (!container) {
        return;
      }
      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      const nextState = {
        hasOverflow: maxScrollLeft > 1,
        canScrollLeft: container.scrollLeft > 1,
        canScrollRight: container.scrollLeft < maxScrollLeft - 1,
      };
      setScrollState((current) =>
        current.hasOverflow === nextState.hasOverflow &&
        current.canScrollLeft === nextState.canScrollLeft &&
        current.canScrollRight === nextState.canScrollRight
          ? current
          : nextState
      );
    };

    const ensureActiveTabVisible = () => {
      const activeTab = tabRefs.current[activeTabId];
      if (!container || !activeTab) {
        return;
      }

      if (tabs.length <= 1 || activeTabIndex <= 0) {
        container.scrollLeft = 0;
        updateScrollState();
        return;
      }

      const maxScrollableLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      if (container.scrollWidth <= container.clientWidth + 1) {
        container.scrollLeft = 0;
        updateScrollState();
        return;
      }

      const tabLeft = activeTab.offsetLeft;
      const tabRight = tabLeft + activeTab.offsetWidth;
      const visibleLeft = container.scrollLeft;
      const visibleRight = visibleLeft + container.clientWidth;
      const gap = 8;

      if (tabLeft <= gap) {
        container.scrollLeft = 0;
      } else if (activeTab.offsetWidth >= container.clientWidth - gap * 2 || tabLeft < visibleLeft) {
        container.scrollLeft = Math.min(Math.max(0, tabLeft - gap), maxScrollableLeft);
      } else if (tabRight > visibleRight) {
        container.scrollLeft = Math.min(Math.max(0, tabRight - container.clientWidth + gap), maxScrollableLeft);
      }
      updateScrollState();
    };

    const scheduleEnsureActiveTabVisible = () => {
      clearCorrectionTimers();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(ensureActiveTabVisible);
      });
      [0, 60, 180, 320].forEach((delay) => {
        correctionTimersRef.current.push(window.setTimeout(ensureActiveTabVisible, delay));
      });
    };

    const observer = container ? new ResizeObserver(scheduleEnsureActiveTabVisible) : null;
    if (container) {
      observer?.observe(container);
      container.addEventListener('scroll', updateScrollState, { passive: true });
    }

    const frameId = window.requestAnimationFrame(scheduleEnsureActiveTabVisible);
    window.addEventListener('resize', scheduleEnsureActiveTabVisible);
    document.addEventListener('fullscreenchange', scheduleEnsureActiveTabVisible);

    return () => {
      observer?.disconnect();
      container?.removeEventListener('scroll', updateScrollState);
      clearCorrectionTimers();
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', scheduleEnsureActiveTabVisible);
      document.removeEventListener('fullscreenchange', scheduleEnsureActiveTabVisible);
    };
  }, [activeTabId, activeTabIndex, tabs.length]);

  const selectTabAt = (index: number) => {
    const nextTab = tabs[index];
    if (!nextTab) {
      return;
    }
    onSelectTab(nextTab.id);
    window.requestAnimationFrame(() => tabRefs.current[nextTab.id]?.focus());
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else if (event.key === 'Enter' || event.key === ' ') {
      nextIndex = index;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      selectTabAt(nextIndex);
    }
  };

  const scrollTabs = (direction: -1 | 1) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.scrollBy({ left: direction * Math.max(160, container.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className="tab-bar">
      <button
        type="button"
        className="tab-scroll-button"
        aria-label={t('tabs.scrollLeft')}
        title={t('tabs.scrollLeft')}
        hidden={!scrollState.hasOverflow}
        disabled={!scrollState.canScrollLeft}
        onClick={() => scrollTabs(-1)}
      >
        ‹
      </button>

      <div ref={containerRef} className="tab-list" role="tablist" aria-label={t('tabs.listLabel')}>
        {tabs.map((tab, index) => {
          const isRenaming = renamingTab?.id === tab.id;
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              className={isActive ? 'tab active' : 'tab'}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={() => onStartRenaming(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
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
                    event.stopPropagation();
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
                    aria-label={t('tabs.close', { title: tab.title })}
                    title={t('tabs.close', { title: tab.title })}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="tab-bar-actions">
        <button
          type="button"
          className="tab-scroll-button"
          aria-label={t('tabs.scrollRight')}
          title={t('tabs.scrollRight')}
          hidden={!scrollState.hasOverflow}
          disabled={!scrollState.canScrollRight}
          onClick={() => scrollTabs(1)}
        >
          ›
        </button>
        <button type="button" className="add-tab" aria-label={t('tabs.add')} title={t('tabs.add')} onClick={onAddTab}>
          <span className="add-tab-plus" aria-hidden="true">
            +
          </span>
        </button>
      </div>
    </div>
  );
};

export default JsonToolTabBar;
