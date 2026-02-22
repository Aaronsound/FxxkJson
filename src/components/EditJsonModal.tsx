import React from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { ArrowLeft } from 'lucide-react';

type EditJsonModalProps = {
  activeTabId: string;
  isDarkMode: boolean;
  editingDataValue: string;
  hasCopied: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCopyEscaped: () => void;
  onClose: () => void;
};

/**
 * JSON 编辑弹窗：用于集中编辑并同步回左侧原始 JSON。
 */
const EditJsonModal: React.FC<EditJsonModalProps> = ({
  activeTabId,
  isDarkMode,
  editingDataValue,
  hasCopied,
  onChange,
  onSave,
  onCopyEscaped,
  onClose,
}) => {
  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        className="modal"
        style={{
          background: '#fff',
          padding: '16px',
          borderRadius: '8px',
          width: '80%',
          maxWidth: '800px',
          maxHeight: '80%',
          overflow: 'auto',
        }}
      >
        <h3>编辑 JSON</h3>
        <Editor
          key={`modal-editor-${activeTabId}`}
          language="json"
          theme={isDarkMode ? 'vs-dark' : 'vs-light'}
          value={editingDataValue}
          onMount={(editor) => {
            editor.updateOptions({ readOnly: false });
            editor.addCommand(monaco.KeyCode.Backspace, () => editor.trigger('', 'deleteLeft', null), 'editorTextFocus');
            editor.addCommand(monaco.KeyCode.Delete, () => editor.trigger('', 'deleteRight', null), 'editorTextFocus');
          }}
          onChange={(v) => onChange(v || '')}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            wordWrap: 'on',
            folding: true,
            readOnly: false,
          }}
          height="400px"
        />

        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            onClick={onSave}
            title="将右侧编辑结果同步到左侧原始 JSON 编辑区"
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <ArrowLeft size={16} style={{ marginRight: 4 }} />
            更新原始 JSON
          </button>

          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <button onClick={onCopyEscaped}>复制为字符串字面量</button>
            {hasCopied && (
              <div
                style={{
                  position: 'absolute',
                  top: '-1.2em',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '2px 6px',
                  background: '#4caf50',
                  color: '#fff',
                  borderRadius: 4,
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                已复制字符串字面量
              </div>
            )}
          </div>

          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
};

export default EditJsonModal;
