import React from 'react';

export type RightEditorContextMenuState = {
  x: number;
  y: number;
  tabId: string;
  offset: number;
};

interface RightEditorContextMenuProps {
  contextMenu: RightEditorContextMenuState;
  isDarkMode: boolean;
  onClose: () => void;
  onToggleFold: (tabId: string, offset: number) => void;
  onCopyPath: (tabId: string, offset: number) => void | Promise<void>;
  onCopyKey: (tabId: string, offset: number) => void | Promise<void>;
  onCopyValue: (tabId: string, offset: number) => void | Promise<void>;
  onCopyCompactJson: (tabId: string, offset: number) => void | Promise<void>;
  onCopyFormattedJson: (tabId: string, offset: number) => void | Promise<void>;
  onEditValue: (tabId: string, offset: number) => void | Promise<void>;
  onRenameKey: (tabId: string, offset: number) => void | Promise<void>;
  onDeleteValue: (tabId: string, offset: number) => void | Promise<void>;
  onUnescapeValue: (tabId: string, offset: number) => void | Promise<void>;
}

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
}) => {
  const runAction = async (
    action: (tabId: string, offset: number) => void | Promise<void>
  ) => {
    const { tabId, offset } = contextMenu;
    onClose();
    await action(tabId, offset);
  };

  const runToggleFold = () => {
    const { tabId, offset } = contextMenu;
    onClose();
    onToggleFold(tabId, offset);
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
      <button type="button" className="large-json-context-menu-item" onClick={runToggleFold}>
        展开/收缩当前节点
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyPath)}>
        复制 JSON Path
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyKey)}>
        复制 key
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyValue)}>
        复制值
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyCompactJson)}>
        复制压缩 JSON
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onCopyFormattedJson)}>
        复制格式化 JSON
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onEditValue)}>
        编辑当前值
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onRenameKey)}>
        重命名 key
      </button>
      <button type="button" className="large-json-context-menu-item danger" onClick={() => runAction(onDeleteValue)}>
        删除当前节点
      </button>
      <button type="button" className="large-json-context-menu-item" onClick={() => runAction(onUnescapeValue)}>
        反转义当前值
      </button>
    </div>
  );
};

export default RightEditorContextMenu;
