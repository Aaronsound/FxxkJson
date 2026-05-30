import React from 'react';
import { createTranslator, type I18nKey } from '../utils/i18n';

export interface LargeJsonContextMenuState {
  x: number;
  y: number;
  offset: number;
  foldLine: number | null;
  parentFoldLine: number | null;
}

interface LargeJsonContextMenuProps {
  contextMenu: LargeJsonContextMenuState;
  isCollapsed: boolean;
  isParentCollapsed: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  onToggleFold: (line: number) => void;
  onCopyPath: (offset: number) => void | Promise<void>;
  onCopyKey: (offset: number) => void | Promise<void>;
  onCopyValue: (offset: number) => void | Promise<void>;
  onCopyCompactJson: (offset: number) => void | Promise<void>;
  onCopyFormattedJson: (offset: number) => void | Promise<void>;
  onEditValue: (offset: number) => void | Promise<void>;
  onDeleteValue: (offset: number) => void | Promise<void>;
  onRenameKey: (offset: number) => void | Promise<void>;
  onUnescapeValue: (offset: number) => void | Promise<void>;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const LargeJsonContextMenu: React.FC<LargeJsonContextMenuProps> = ({
  contextMenu,
  isCollapsed,
  isParentCollapsed,
  isDarkMode,
  onClose,
  onToggleFold,
  onCopyPath,
  onCopyKey,
  onCopyValue,
  onCopyCompactJson,
  onCopyFormattedJson,
  onEditValue,
  onDeleteValue,
  onRenameKey,
  onUnescapeValue,
  t = defaultT,
}) => {
  const runAction = async (action: (offset: number) => void | Promise<void>) => {
    await action(contextMenu.offset);
    onClose();
  };

  return (
    <div
      className={`large-json-context-menu ${isDarkMode ? 'dark' : ''}`}
      style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {contextMenu.foldLine !== null && (
        <button
          type="button"
          className="large-json-context-menu-item"
          onClick={() => {
            if (contextMenu.foldLine !== null) {
              onToggleFold(contextMenu.foldLine);
            }
            onClose();
          }}
        >
          {isCollapsed ? t('context.expandCurrentFold') : t('context.collapseCurrentFold')}
        </button>
      )}
      {contextMenu.parentFoldLine !== null && (
        <button
          type="button"
          className="large-json-context-menu-item"
          onClick={() => {
            if (contextMenu.parentFoldLine !== null) {
              onToggleFold(contextMenu.parentFoldLine);
            }
            onClose();
          }}
        >
          {isParentCollapsed ? t('context.expandParentFold') : t('context.collapseParentFold')}
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

export default LargeJsonContextMenu;
