import React from 'react';
import { Tab } from '../types/app';

type RenamingTab = {
  id: string;
  value: string;
};

type TabBarProps = {
  tabs: Tab[];
  activeTabId: string;
  renamingTab: RenamingTab | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onStartRename: (tabId: string, title: string) => void;
  onRenamingChange: (next: RenamingTab) => void;
  onFinishRename: () => void;
  onCancelRename: () => void;
  onAddTab: () => void;
};

/**
 * 标签栏组件：处理标签展示、切换、重命名交互。
 */
const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  renamingTab,
  onTabClick,
  onTabClose,
  onStartRename,
  onRenamingChange,
  onFinishRename,
  onCancelRename,
  onAddTab,
}) => {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => {
        const isRenaming = renamingTab?.id === tab.id;

        return (
          <div
            key={tab.id}
            className={tab.id === activeTabId ? 'tab active' : 'tab'}
            onClick={() => onTabClick(tab.id)}
            onDoubleClick={() => onStartRename(tab.id, tab.title)}
            onContextMenu={(e) => {
              e.preventDefault();
              onStartRename(tab.id, tab.title);
            }}
          >
            {isRenaming && renamingTab ? (
              <input
                autoFocus
                value={renamingTab.value}
                onChange={(e) => onRenamingChange({ ...renamingTab, value: e.target.value })}
                onBlur={onFinishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onFinishRename();
                  if (e.key === 'Escape') onCancelRename();
                }}
                style={{ width: '80px', fontSize: 'inherit', fontFamily: 'inherit' }}
              />
            ) : (
              <>
                {tab.title}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                >
                  ×
                </span>
              </>
            )}
          </div>
        );
      })}

      <button className="add-tab" onClick={onAddTab}>
        ＋
      </button>
    </div>
  );
};

export default React.memo(TabBar);
