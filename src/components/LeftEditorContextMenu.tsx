import React from 'react';
import { createTranslator, type I18nKey } from '../utils/i18n';

export type LeftEditorContextMenuState = {
  x: number;
  y: number;
  hasSelection: boolean;
};

interface LeftEditorContextMenuProps {
  contextMenu: LeftEditorContextMenuState;
  isDarkMode: boolean;
  onClose: () => void;
  onCopy: () => void | Promise<void>;
  onCut: () => void | Promise<void>;
  onPaste: () => void | Promise<void>;
  onSelectAll: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const LeftEditorContextMenu: React.FC<LeftEditorContextMenuProps> = ({
  contextMenu,
  isDarkMode,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onSelectAll,
  t = defaultT,
}) => {
  const runAction = async (action: () => void | Promise<void>) => {
    onClose();
    await action();
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
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onPaste)}>
        {t('editorContext.paste')}
      </button>
      <button
        type="button"
        className="large-json-context-menu-item"
        disabled={!contextMenu.hasSelection}
        onClick={() => runAction(onCopy)}
      >
        {t('editorContext.copy')}
      </button>
      <button
        type="button"
        className="large-json-context-menu-item"
        disabled={!contextMenu.hasSelection}
        onClick={() => runAction(onCut)}
      >
        {t('editorContext.cut')}
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onSelectAll)}>
        {t('editorContext.selectAll')}
      </button>
    </div>
  );
};

export default LeftEditorContextMenu;
