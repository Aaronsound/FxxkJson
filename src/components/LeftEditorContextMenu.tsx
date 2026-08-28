import type React from 'react';
import { createTranslator, type I18nKey } from '../utils/i18n';
import ContextMenuSurface from './ContextMenuSurface';

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
    <ContextMenuSurface
      ariaLabel={t('editorContext.menuLabel')}
      isDarkMode={isDarkMode}
      onClose={onClose}
      style={{
        left: contextMenu.x,
        top: contextMenu.y,
      }}
    >
      <div className="large-json-context-menu-group" role="group" aria-label={t('editorContext.clipboardGroup')}>
        <button
          type="button"
          role="menuitem"
          className="large-json-context-menu-item"
          onClick={() => runAction(onPaste)}
        >
          {t('editorContext.paste')}
        </button>
        <button
          type="button"
          role="menuitem"
          className="large-json-context-menu-item"
          disabled={!contextMenu.hasSelection}
          onClick={() => runAction(onCopy)}
        >
          {t('editorContext.copy')}
        </button>
        <button
          type="button"
          role="menuitem"
          className="large-json-context-menu-item"
          disabled={!contextMenu.hasSelection}
          onClick={() => runAction(onCut)}
        >
          {t('editorContext.cut')}
        </button>
      </div>
      <div className="large-json-context-menu-group" role="group" aria-label={t('editorContext.selectionGroup')}>
        <button
          type="button"
          role="menuitem"
          className="large-json-context-menu-item"
          onClick={() => runAction(onSelectAll)}
        >
          {t('editorContext.selectAll')}
        </button>
      </div>
    </ContextMenuSurface>
  );
};

export default LeftEditorContextMenu;
