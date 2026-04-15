import React from 'react';
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
}) => (
  <div className="tab-bar">
    {tabs.map((tab) => {
      const isRenaming = renamingTab?.id === tab.id;

      return (
        <div
          key={tab.id}
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
              style={{
                width: '80px',
                fontSize: 'inherit',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <>
              {tab.title}
              <span
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                ×
              </span>
            </>
          )}
        </div>
      );
    })}
    <button className="add-tab" onClick={onAddTab}>+</button>
  </div>
);

export default JsonToolTabBar;
