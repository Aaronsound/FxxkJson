import React from 'react';
import JsonEditorPanes from './JsonEditorPanes';
import JsonPerformancePanel from './JsonPerformancePanel';
import JsonToolContextMenus from './JsonToolContextMenus';
import JsonToolOverlayLayer from './JsonToolOverlayLayer';
import JsonToolTabBar from './JsonToolTabBar';
import JsonToolToolbar from './JsonToolToolbar';

interface JsonToolWorkspaceProps {
  contextMenusProps: React.ComponentProps<typeof JsonToolContextMenus>;
  fileInputRef: React.Ref<HTMLInputElement>;
  isDarkMode: boolean;
  onDragEnter: React.DragEventHandler<HTMLDivElement>;
  onDragLeave: React.DragEventHandler<HTMLDivElement>;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onFileSelection: React.ChangeEventHandler<HTMLInputElement>;
  overlayProps: React.ComponentProps<typeof JsonToolOverlayLayer>;
  panesProps: React.ComponentProps<typeof JsonEditorPanes>;
  performancePanelProps: React.ComponentProps<typeof JsonPerformancePanel>;
  shouldShowPerformancePanel: boolean;
  tabBarProps: React.ComponentProps<typeof JsonToolTabBar>;
  toolbarProps: React.ComponentProps<typeof JsonToolToolbar>;
}

const JsonToolWorkspace: React.FC<JsonToolWorkspaceProps> = ({
  contextMenusProps,
  fileInputRef,
  isDarkMode,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileSelection,
  overlayProps,
  panesProps,
  performancePanelProps,
  shouldShowPerformancePanel,
  tabBarProps,
  toolbarProps,
}) => (
  <div
    className={isDarkMode ? 'app-container dark-mode' : 'app-container'}
    onDragEnter={onDragEnter}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    style={{
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <input
      ref={fileInputRef}
      type="file"
      accept=".json,.txt,application/json,text/plain"
      style={{ display: 'none' }}
      onChange={onFileSelection}
    />

    <JsonToolOverlayLayer {...overlayProps} />
    <JsonToolToolbar {...toolbarProps} />
    {shouldShowPerformancePanel && <JsonPerformancePanel {...performancePanelProps} />}
    <JsonToolTabBar {...tabBarProps} />
    <JsonEditorPanes {...panesProps} />
    <JsonToolContextMenus {...contextMenusProps} />
  </div>
);

export default JsonToolWorkspace;
