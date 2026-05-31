import React from 'react';
import type { FoldTargetMode } from '../utils/foldableLine';
import { createTranslator, type I18nKey } from '../utils/i18n';

export type RightEditorContextMenuState = {
  x: number;
  y: number;
  tabId: string;
  offset: number;
  hasCurrentFoldTarget: boolean;
  hasParentFoldTarget: boolean;
};

interface RightEditorContextMenuProps {
  contextMenu: RightEditorContextMenuState;
  isDarkMode: boolean;
  onClose: () => void;
  onToggleFold: (tabId: string, offset: number, mode: FoldTargetMode) => void;
  onCopyPath: (tabId: string, offset: number) => void | Promise<void>;
  onCopyKey: (tabId: string, offset: number) => void | Promise<void>;
  onCopyValue: (tabId: string, offset: number) => void | Promise<void>;
  onCopyCompactJson: (tabId: string, offset: number) => void | Promise<void>;
  onCopyFormattedJson: (tabId: string, offset: number) => void | Promise<void>;
  onEditValue: (tabId: string, offset: number) => void | Promise<void>;
  onRenameKey: (tabId: string, offset: number) => void | Promise<void>;
  onDeleteValue: (tabId: string, offset: number) => void | Promise<void>;
  onUnescapeValue: (tabId: string, offset: number) => void | Promise<void>;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const RightEditorContextMenu: React.FC<RightEditorContextMenuProps> = ({
  contextMenu,
  isDarkMode,
  onClose,
  onToggleFold,
  onCopyPath,
  onCopyKey,
  onCopyValue,
  onCopyCompactJson,
  onCopyFormattedJson,
  onEditValue,
  onRenameKey,
  onDeleteValue,
  onUnescapeValue,
  t = defaultT,
}) => {
  const runAction = async (action: (tabId: string, offset: number) => void | Promise<void>) => {
    const { tabId, offset } = contextMenu;
    onClose();
    await action(tabId, offset);
  };

  const runToggleFold = (mode: FoldTargetMode) => {
    const { tabId, offset } = contextMenu;
    onClose();
    onToggleFold(tabId, offset, mode);
  };

  return (
    <div
      className={`large-json-context-menu ${isDarkMode ? 'dark' : ''}`}
      style={{
        left: contextMenu.x,
        top: contextMenu.y,
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {contextMenu.hasCurrentFoldTarget && (
        <button type="button" className="large-json-context-menu-item" onClick={() => runToggleFold('current')}>
          {t('context.toggleCurrentFold')}
        </button>
      )}
      {contextMenu.hasParentFoldTarget && (
        <button type="button" className="large-json-context-menu-item" onClick={() => runToggleFold('parent')}>
          {t('context.toggleParentFold')}
        </button>
      )}
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyPath)}>
        {t('context.copyPath')}
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyKey)}>
        {t('context.copyKey')}
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyValue)}>
        {t('context.copyValue')}
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyCompactJson)}>
        {t('context.copyCompact')}
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyFormattedJson)}>
        {t('context.copyFormatted')}
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onEditValue)}>
        {t('context.editValue')}
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onRenameKey)}>
        {t('context.renameKey')}
      </button>
      <button type="button" className="large-json-context-menu-item danger" onClick={() => runAction(onDeleteValue)}>
        {t('context.deleteNode')}
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onUnescapeValue)}>
        {t('context.unescapeValue')}
      </button>
    </div>
  );
};

export default RightEditorContextMenu;
