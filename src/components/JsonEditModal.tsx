import React from 'react';
import Editor from '@monaco-editor/react';

interface JsonEditModalProps {
  sessionKey: number;
  initialValue: string;
  isDarkMode: boolean;
  error: string | null;
  busyLabel: string | null;
  hasCopiedLiteral: boolean;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCopyLiteral: () => void;
  onClose: () => void;
}

const JsonEditModal: React.FC<JsonEditModalProps> = ({
  sessionKey,
  initialValue,
  isDarkMode,
  error,
  busyLabel,
  hasCopiedLiteral,
  onValueChange,
  onSave,
  onCopyLiteral,
  onClose,
}) => {
  const isBusy = Boolean(busyLabel);

  return (
    <div className="modal-overlay">
      <div className={isDarkMode ? 'modal-card modal-card-dark' : 'modal-card'}>
        <div className="modal-header">
          <h3>编辑 JSON</h3>
        </div>

        <Editor
          key={`modal-editor-${sessionKey}`}
          defaultLanguage="json"
          defaultValue={initialValue}
          theme={isDarkMode ? 'vs-dark' : 'vs-light'}
          onChange={(value) => onValueChange(value ?? '')}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            wordWrap: 'on',
            folding: true,
            scrollBeyondLastLine: false,
            readOnly: isBusy,
          }}
          height="400px"
          loading={null}
        />

        <div className="modal-actions">
          <button onClick={onSave} disabled={isBusy}>更新原始 JSON</button>
          <div className="modal-copy-group">
            <button onClick={onCopyLiteral} disabled={isBusy}>复制为字符串字面量</button>
            {hasCopiedLiteral && (
              <span className="modal-copy-hint">已复制字符串字面量</span>
            )}
          </div>
          <button onClick={onClose} disabled={isBusy}>取消</button>
        </div>

        {busyLabel && <div className="modal-error">{busyLabel}</div>}
        {error && <div className="modal-error">{error}</div>}
      </div>
    </div>
  );
};

export default JsonEditModal;
