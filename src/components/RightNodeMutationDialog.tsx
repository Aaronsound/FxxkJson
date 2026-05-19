import React, { useEffect, useState } from 'react';

export type RightNodeMutationDialogState =
  | {
      mode: 'delete';
      pathText: string;
      preview: string;
    }
  | {
      mode: 'rename';
      currentKey: string;
      pathText: string;
    };

interface RightNodeMutationDialogProps {
  state: RightNodeMutationDialogState;
  isDarkMode: boolean;
  onCancel: () => void;
  onConfirmDelete: () => void;
  onConfirmRename: (nextKey: string) => void;
}

const RightNodeMutationDialog: React.FC<RightNodeMutationDialogProps> = ({
  state,
  isDarkMode,
  onCancel,
  onConfirmDelete,
  onConfirmRename,
}) => {
  const [nextKey, setNextKey] = useState(state.mode === 'rename' ? state.currentKey : '');

  useEffect(() => {
    setNextKey(state.mode === 'rename' ? state.currentKey : '');
  }, [state]);

  const isRename = state.mode === 'rename';
  const title = isRename ? '重命名 key' : '删除当前节点';
  const canSubmitRename = nextKey.trim().length > 0;
  const hasOuterWhitespace = isRename && nextKey.length !== nextKey.trim().length;
  const renameWarning = isRename
    ? [
      hasOuterWhitespace ? '首尾空格会作为 key 名称的一部分保存。' : null,
      nextKey !== state.currentKey ? '如果同级对象里已有同名 key，JSON 将保留重复 key。' : null,
    ].filter(Boolean).join(' ')
    : '';

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="right-node-mutation-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onCancel();
        }
      }}
    >
      <div className={isDarkMode ? 'modal-card modal-card-dark right-node-mutation-card' : 'modal-card right-node-mutation-card'}>
        <div className="modal-header">
          <h3 id="right-node-mutation-title">{title}</h3>
        </div>

        <div className="right-node-mutation-body">
          <div className="modal-path" title={state.pathText}>{state.pathText}</div>
          {isRename ? (
            <label className="right-node-mutation-field">
              <span>新的 key 名称</span>
              <input
                autoFocus
                value={nextKey}
                onChange={(event) => setNextKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSubmitRename) {
                    onConfirmRename(nextKey);
                  }
                  if (event.key === 'Escape') {
                    onCancel();
                  }
                }}
              />
              {renameWarning && (
                <span className="right-node-mutation-warning">{renameWarning}</span>
              )}
            </label>
          ) : (
            <>
              <p className="right-node-mutation-message">
                删除后会立即更新当前 JSON 内容。
              </p>
              <pre className="right-node-mutation-preview">{state.preview}</pre>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>取消</button>
          {isRename ? (
            <button type="button" onClick={() => onConfirmRename(nextKey)} disabled={!canSubmitRename}>
              确认重命名
            </button>
          ) : (
            <button type="button" className="danger-button" onClick={onConfirmDelete}>
              确认删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RightNodeMutationDialog;
