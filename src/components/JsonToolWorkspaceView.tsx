import type React from 'react';
import JsonToolWorkspace from './JsonToolWorkspace';
import type { createJsonToolWorkspaceProps } from '../hooks/createJsonToolWorkspaceProps';

type WorkspaceProps = ReturnType<typeof createJsonToolWorkspaceProps>;

interface JsonToolWorkspaceViewProps {
  fileInputRef: React.Ref<HTMLInputElement>;
  isDarkMode: boolean;
  onDragEnter: React.DragEventHandler<HTMLDivElement>;
  onDragLeave: React.DragEventHandler<HTMLDivElement>;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onFileSelection: React.ChangeEventHandler<HTMLInputElement>;
  shouldShowPerformancePanel: boolean;
  workspaceProps: WorkspaceProps;
}

const JsonToolWorkspaceView: React.FC<JsonToolWorkspaceViewProps> = ({
  fileInputRef,
  isDarkMode,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileSelection,
  shouldShowPerformancePanel,
  workspaceProps,
}) => (
  <JsonToolWorkspace
    contextMenusProps={workspaceProps.contextMenusProps}
    fileInputRef={fileInputRef}
    isDarkMode={isDarkMode}
    onDragEnter={onDragEnter}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    onFileSelection={onFileSelection}
    overlayProps={workspaceProps.overlayProps}
    panesProps={workspaceProps.panesProps}
    performancePanelProps={workspaceProps.performancePanelProps}
    shouldShowPerformancePanel={shouldShowPerformancePanel}
    tabBarProps={workspaceProps.tabBarProps}
    toolbarProps={workspaceProps.toolbarProps}
  />
);

export default JsonToolWorkspaceView;
