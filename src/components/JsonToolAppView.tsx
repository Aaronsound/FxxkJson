import type React from 'react';
import JsonToolWorkspaceView from './JsonToolWorkspaceView';
import type { createJsonToolWorkspaceProps } from '../hooks/createJsonToolWorkspaceProps';

type WorkspaceProps = ReturnType<typeof createJsonToolWorkspaceProps>;

interface JsonToolAppViewProps {
  fileInputRef: React.RefObject<HTMLInputElement>;
  isDarkMode: boolean;
  onDragEnter: React.DragEventHandler<HTMLDivElement>;
  onDragLeave: React.DragEventHandler<HTMLDivElement>;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onFileSelection: React.ChangeEventHandler<HTMLInputElement>;
  shouldShowPerformancePanel: boolean;
  workspaceProps: WorkspaceProps;
}

const JsonToolAppView: React.FC<JsonToolAppViewProps> = ({
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
  <JsonToolWorkspaceView
    fileInputRef={fileInputRef}
    isDarkMode={isDarkMode}
    onDragEnter={onDragEnter}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    onFileSelection={onFileSelection}
    shouldShowPerformancePanel={shouldShowPerformancePanel}
    workspaceProps={workspaceProps}
  />
);

export default JsonToolAppView;
