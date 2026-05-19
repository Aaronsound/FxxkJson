import React from 'react';

export interface LargeJsonContextMenuState {
  x: number;
  y: number;
  offset: number;
  foldLine: number | null;
}

interface LargeJsonContextMenuProps {
  contextMenu: LargeJsonContextMenuState;
  isCollapsed: boolean;
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
}

const LargeJsonContextMenu: React.FC<LargeJsonContextMenuProps> = ({
  contextMenu,
  isCollapsed,
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
          {isCollapsed ? '展开当前节点' : '收缩当前节点'}
        </button>
      )}
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

export default LargeJsonContextMenu;
