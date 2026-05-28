import React from 'react';
import LeftEditorContextMenu from './LeftEditorContextMenu';
import RightEditorContextMenu from './RightEditorContextMenu';
import type { I18nKey } from '../utils/i18n';

interface JsonToolContextMenusProps {
  copyLeftEditorSelection: () => void | Promise<void>;
  copyNodeDetailAtOffset: (
    tabId: string,
    offset: number,
    shouldReveal: boolean,
    detail: 'path' | 'key' | 'compact-json' | 'formatted-json'
  ) => void | Promise<void>;
  copyValueAtOffset: (tabId: string, offset: number, shouldReveal: boolean) => void | Promise<void>;
  cutLeftEditorSelection: () => void | Promise<void>;
  handleOpenEditNodeAtOffset: (tabId: string, offset: number, shouldReveal: boolean) => void | Promise<void>;
  handleOpenUnescapedNodeAtOffset: (tabId: string, offset: number, shouldReveal: boolean) => void | Promise<void>;
  isDarkMode: boolean;
  leftEditorContextMenu: React.ComponentProps<typeof LeftEditorContextMenu>['contextMenu'] | null;
  pasteIntoLeftEditor: () => void | Promise<void>;
  rightEditorContextMenu: React.ComponentProps<typeof RightEditorContextMenu>['contextMenu'] | null;
  selectAllLeftEditorText: () => void;
  setLeftEditorContextMenu: React.Dispatch<
    React.SetStateAction<React.ComponentProps<typeof LeftEditorContextMenu>['contextMenu'] | null>
  >;
  setRightEditorContextMenu: React.Dispatch<
    React.SetStateAction<React.ComponentProps<typeof RightEditorContextMenu>['contextMenu'] | null>
  >;
  shouldUseDedicatedLeftViewer: boolean;
  shouldUseDedicatedRightViewer: boolean;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
  toggleRightFoldAtOffset: (tabId: string, offset: number) => void;
  applyRightNodeMutationAtOffset: (
    tabId: string,
    offset: number,
    shouldReveal: boolean,
    operation: 'rename-node-key' | 'delete-node'
  ) => void | Promise<void>;
}

const JsonToolContextMenus: React.FC<JsonToolContextMenusProps> = ({
  applyRightNodeMutationAtOffset,
  copyLeftEditorSelection,
  copyNodeDetailAtOffset,
  copyValueAtOffset,
  cutLeftEditorSelection,
  handleOpenEditNodeAtOffset,
  handleOpenUnescapedNodeAtOffset,
  isDarkMode,
  leftEditorContextMenu,
  pasteIntoLeftEditor,
  rightEditorContextMenu,
  selectAllLeftEditorText,
  setLeftEditorContextMenu,
  setRightEditorContextMenu,
  shouldUseDedicatedLeftViewer,
  shouldUseDedicatedRightViewer,
  t,
  toggleRightFoldAtOffset,
}) => (
  <>
    {rightEditorContextMenu && !shouldUseDedicatedRightViewer && (
      <RightEditorContextMenu
        contextMenu={rightEditorContextMenu}
        isDarkMode={isDarkMode}
        onClose={() => setRightEditorContextMenu(null)}
        onToggleFold={toggleRightFoldAtOffset}
        onCopyPath={(tabId, offset) => copyNodeDetailAtOffset(tabId, offset, true, 'path')}
        onCopyKey={(tabId, offset) => copyNodeDetailAtOffset(tabId, offset, true, 'key')}
        onCopyValue={(tabId, offset) => copyValueAtOffset(tabId, offset, true)}
        onCopyCompactJson={(tabId, offset) => copyNodeDetailAtOffset(tabId, offset, true, 'compact-json')}
        onCopyFormattedJson={(tabId, offset) => copyNodeDetailAtOffset(tabId, offset, true, 'formatted-json')}
        onEditValue={(tabId, offset) => handleOpenEditNodeAtOffset(tabId, offset, true)}
        onRenameKey={(tabId, offset) => applyRightNodeMutationAtOffset(tabId, offset, true, 'rename-node-key')}
        onDeleteValue={(tabId, offset) => applyRightNodeMutationAtOffset(tabId, offset, true, 'delete-node')}
        onUnescapeValue={(tabId, offset) => handleOpenUnescapedNodeAtOffset(tabId, offset, true)}
        t={t}
      />
    )}

    {leftEditorContextMenu && !shouldUseDedicatedLeftViewer && (
      <LeftEditorContextMenu
        contextMenu={leftEditorContextMenu}
        isDarkMode={isDarkMode}
        onClose={() => setLeftEditorContextMenu(null)}
        onCopy={copyLeftEditorSelection}
        onCut={cutLeftEditorSelection}
        onPaste={pasteIntoLeftEditor}
        onSelectAll={selectAllLeftEditorText}
        t={t}
      />
    )}
  </>
);

export default JsonToolContextMenus;
