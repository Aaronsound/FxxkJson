import type React from 'react';
import type JsonToolWorkspace from '../components/JsonToolWorkspace';
import { createJsonToolContextMenusProps, createJsonToolPanesProps } from './jsonToolPaneMenuProps';
import { createJsonToolOverlayProps, createJsonToolToolbarProps } from './jsonToolOverlayToolbarProps';

type JsonToolWorkspaceProps = React.ComponentProps<typeof JsonToolWorkspace>;
export type JsonToolWorkspaceInput = Record<string, any>;

export function createJsonToolWorkspaceProps(
  input: JsonToolWorkspaceInput
): Pick<
  JsonToolWorkspaceProps,
  'contextMenusProps' | 'overlayProps' | 'panesProps' | 'performancePanelProps' | 'tabBarProps' | 'toolbarProps'
> {
  return {
    contextMenusProps: createJsonToolContextMenusProps(input),
    overlayProps: createJsonToolOverlayProps(input),
    panesProps: createJsonToolPanesProps(input),
    performancePanelProps: {
      snapshot: input.activePerformanceSnapshot,
      history: input.performanceHistory,
      isDarkMode: input.isDarkMode,
    },
    tabBarProps: {
      tabs: input.tabs,
      activeTabId: input.activeTabId,
      renamingTab: input.renamingTab,
      onSelectTab: input.setActiveTabId,
      onStartRenaming: input.startRenamingTab,
      onRenamingChange: input.handleRenamingChange,
      onFinishRenaming: input.finishRenaming,
      onCancelRenaming: input.cancelRenaming,
      onCloseTab: input.closeTab,
      onAddTab: input.addTab,
    },
    toolbarProps: createJsonToolToolbarProps(input),
  };
}
