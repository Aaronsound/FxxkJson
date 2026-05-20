import React, { useCallback, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import PaneFindWidget from './PaneFindWidget';
import { useEditModalSearch } from '../hooks/useEditModalSearch';
import { getJsonEditorTheme } from '../utils/jsonEditorTypography';

const EDIT_MODAL_SEARCH_BATCH_SIZE = 50000;

interface JsonEditModalProps {
  sessionKey: number;
  initialValue: string;
  isDarkMode: boolean;
  error: string | null;
  busyLabel: string | null;
  hasCopiedLiteral: boolean;
  title?: string;
  pathText?: string;
  saveLabel?: string;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onUnescapeContent: (value: string) => Promise<string>;
  onEscapeContent: (value: string) => Promise<string>;
  onCopyLiteral: () => void;
  onClose: () => void;
}

type JsonEditModalE2EWindow = Window & {
  __HANJSON_E2E__?: boolean;
  __HANJSON_E2E_EDIT_MODAL__?: {
    setValue: (value: string) => void;
  };
};

const JsonEditModal: React.FC<JsonEditModalProps> = ({
  sessionKey,
  initialValue,
  isDarkMode,
  error,
  busyLabel,
  hasCopiedLiteral,
  title = '编辑 JSON',
  pathText,
  saveLabel = '更新为原始 JSON',
  onValueChange,
  onSave,
  onUnescapeContent,
  onEscapeContent,
  onCopyLiteral,
  onClose,
}) => {
  const isBusy = Boolean(busyLabel);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const isBusyRef = useRef(isBusy);
  const onCloseRef = useRef(onClose);
  const closeFindRef = useRef<() => void>(() => undefined);
  const editSearch = useEditModalSearch({
    editorRef,
    searchBatchSize: EDIT_MODAL_SEARCH_BATCH_SIZE,
  });

  useEffect(() => {
    isBusyRef.current = isBusy;
    onCloseRef.current = onClose;
    closeFindRef.current = editSearch.closeFind;
  }, [editSearch.closeFind, isBusy, onClose]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isBusyRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && modalRef.current?.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
        if (editSearch.isFindOpenRef.current) {
          closeFindRef.current();
          return;
        }
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleEscape, true);

    return () => {
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, []);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    const e2eWindow = window as JsonEditModalE2EWindow;
    if (e2eWindow.__HANJSON_E2E__) {
      e2eWindow.__HANJSON_E2E_EDIT_MODAL__ = {
        setValue(nextValue: string) {
          const model = editor.getModel();
          if (model) {
            editor.pushUndoStop();
            editor.executeEdits('hanjson-e2e', [{
              range: model.getFullModelRange(),
              text: nextValue,
              forceMoveMarkers: true,
            }]);
            editor.pushUndoStop();
          }
          onValueChange(nextValue);
          editSearch.refreshSearch();
        },
      };
    }
    editor.onDidDispose(() => {
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
      if (e2eWindow.__HANJSON_E2E_EDIT_MODAL__) {
        delete e2eWindow.__HANJSON_E2E_EDIT_MODAL__;
      }
    });
    editor.onDidChangeModelContent(() => {
      editSearch.captureSearchAnchor(editor);
      editSearch.refreshSearch();
    });

    window.setTimeout(() => {
      editor.focus();
    }, 0);

    editor.addCommand(monaco.KeyCode.Escape, () => {
      if (isBusyRef.current) {
        return;
      }

      if (editSearch.isFindOpenRef.current) {
        closeFindRef.current();
      } else {
        onCloseRef.current();
      }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      editSearch.openFind();
    });
  };

  const replaceEditorValue = useCallback((nextValue: string) => {
    const editor = editorRef.current;
    const model = editor?.getModel() ?? null;

    if (editor && model) {
      editor.pushUndoStop();
      editor.executeEdits('json-edit-transform', [{
        range: model.getFullModelRange(),
        text: nextValue,
        forceMoveMarkers: true,
      }]);
      editor.pushUndoStop();
      const nextPosition = model.getPositionAt(nextValue.length);
      editor.setPosition(nextPosition);
      editor.revealPositionInCenter(nextPosition);
    }

    onValueChange(nextValue);
    editSearch.refreshSearch();
  }, [editSearch, onValueChange]);

  const handleTransformContent = async (
    transform: (value: string) => Promise<string>
  ) => {
    if (isBusy) {
      return;
    }

    const currentValue = editorRef.current?.getValue() ?? initialValue;

    try {
      const nextValue = await transform(currentValue);
      replaceEditorValue(nextValue);
    } catch {
      // The parent owns the user-facing error copy so worker errors stay consistent.
    }
  };

  return (
    <div className="modal-overlay" ref={modalRef}>
      <div className={isDarkMode ? 'modal-card modal-card-dark' : 'modal-card'}>
        <div className="modal-header">
          <h3>{title}</h3>
          {pathText && (
            <div className="modal-path" title={pathText}>
              {pathText}
            </div>
          )}
        </div>

        <div className="modal-editor-shell">
          {editSearch.isFindOpen && (
            <PaneFindWidget
              value={editSearch.searchTerm}
              currentIndex={editSearch.searchMatches.length > 0 ? editSearch.normalizedSearchIndex + 1 : 0}
              matchCount={editSearch.searchMatches.length}
              hasMore={editSearch.searchHasMore}
              isDarkMode={isDarkMode}
              placeholder="搜索编辑内容"
              searchOptions={editSearch.searchOptions}
              onChange={editSearch.handleSearchTermChange}
              onSearchOptionsChange={editSearch.handleSearchOptionsChange}
              onLoadMore={editSearch.loadMoreSearch}
              onPrev={editSearch.goToPreviousMatch}
              onNext={editSearch.goToNextMatch}
              onClose={editSearch.closeFind}
            />
          )}
          <Editor
            key={`modal-editor-${sessionKey}`}
            defaultLanguage="json"
            defaultValue={initialValue}
            theme={getJsonEditorTheme(isDarkMode)}
            onMount={handleEditorMount}
            onChange={(value) => onValueChange(value ?? '')}
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              wordWrap: 'on',
              folding: true,
              scrollBeyondLastLine: false,
              readOnly: isBusy,
            }}
            height="100%"
            loading={null}
          />
        </div>

        <div className="modal-actions">
          <button onClick={onSave} disabled={isBusy}>{saveLabel}</button>
          <div className="modal-copy-group">
            <button onClick={() => void handleTransformContent(onUnescapeContent)} disabled={isBusy}>
              反转义内容
            </button>
            <button onClick={() => void handleTransformContent(onEscapeContent)} disabled={isBusy}>
              转义为字符串
            </button>
          </div>
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
