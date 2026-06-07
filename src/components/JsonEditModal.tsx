import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import JsonMonacoEditor from './JsonMonacoEditor';
import PaneFindWidget from './PaneFindWidget';
import { useEditModalSearch } from '../hooks/useEditModalSearch';
import { writeTextToClipboard } from '../utils/clipboard';
import {
  getJsonEditSelectionContext,
  hasJsonEditSelection,
  replaceJsonEditDocument,
  replaceJsonEditSelection,
  runWritableEditorEdit,
} from '../utils/jsonEditModalTransforms';
import { createTranslator, type I18nKey } from '../utils/i18n';

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
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

type JsonEditModalE2EWindow = Window & {
  __HANJSON_E2E__?: boolean;
  __HANJSON_E2E_EDIT_MODAL__?: {
    getValue: () => string;
    selectText: (text: string) => boolean;
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
  t = defaultT,
}) => {
  const isBusy = Boolean(busyLabel);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const isBusyRef = useRef(isBusy);
  const onCloseRef = useRef(onClose);
  const closeFindRef = useRef<() => void>(() => undefined);
  const [transformNotice, setTransformNotice] = useState<string | null>(null);
  const [transformError, setTransformError] = useState<string | null>(null);
  const [transformCopyNotice, setTransformCopyNotice] = useState<string | null>(null);
  const [lastTransformResult, setLastTransformResult] = useState<string | null>(null);
  const [hasActiveSelection, setHasActiveSelection] = useState(false);
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
    const openModalFind = () => {
      editSearch.openFind();
      window.setTimeout(() => {
        const input = modalRef.current?.querySelector<HTMLInputElement>('.pane-find-input');
        input?.focus();
        input?.select();
      }, 0);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTargetInsideModal = target instanceof Node && modalRef.current?.contains(target);

      if (!isTargetInsideModal) {
        return;
      }

      const isPrimaryFindShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      if (event.key.toLowerCase() === 'f' && isPrimaryFindShortcut) {
        event.preventDefault();
        event.stopPropagation();
        openModalFind();
        return;
      }

      if (event.key !== 'Escape' || isBusyRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (editSearch.isFindOpenRef.current) {
        closeFindRef.current();
        return;
      }
      onCloseRef.current();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    const unsubscribeFindShortcut = window.electronAPI?.onFindShortcut?.(openModalFind);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      unsubscribeFindShortcut?.();
    };
  }, [editSearch.openFind]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    const e2eWindow = window as JsonEditModalE2EWindow;
    if (e2eWindow.__HANJSON_E2E__) {
      e2eWindow.__HANJSON_E2E_EDIT_MODAL__ = {
        getValue() {
          return editor.getValue();
        },
        selectText(text: string) {
          const model = editor.getModel();
          const value = model?.getValue() ?? '';
          const offset = value.indexOf(text);
          if (!model || offset < 0) {
            return false;
          }

          const startPosition = model.getPositionAt(offset);
          const endPosition = model.getPositionAt(offset + text.length);
          editor.setSelection(
            new monaco.Selection(
              startPosition.lineNumber,
              startPosition.column,
              endPosition.lineNumber,
              endPosition.column
            )
          );
          editor.revealRangeInCenter(editor.getSelection() ?? model.getFullModelRange());
          return true;
        },
        setValue(nextValue: string) {
          const model = editor.getModel();
          if (model) {
            runWritableEditorEdit(editor, () => {
              editor.pushUndoStop();
              editor.executeEdits('fxxkjson-e2e', [
                {
                  range: model.getFullModelRange(),
                  text: nextValue,
                  forceMoveMarkers: true,
                },
              ]);
              editor.pushUndoStop();
            });
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
    const selectionDisposable = editor.onDidChangeCursorSelection(() => {
      setHasActiveSelection(hasJsonEditSelection(editor));
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

    setHasActiveSelection(hasJsonEditSelection(editor));
    editor.onDidDispose(() => {
      selectionDisposable.dispose();
    });
  };

  const replaceEditorValue = useCallback(
    (nextValue: string) => {
      const editor = editorRef.current;
      replaceJsonEditDocument(editor, nextValue);

      onValueChange(nextValue);
      editSearch.refreshSearch();
    },
    [editSearch, onValueChange]
  );

  const handleTransformContent = async (transform: (value: string) => Promise<string>) => {
    if (isBusy) {
      return;
    }

    const editor = editorRef.current;
    const selectedContext = getJsonEditSelectionContext(editor);
    const currentValue = selectedContext
      ? selectedContext.model.getValueInRange(selectedContext.selection)
      : (editor?.getValue() ?? initialValue);

    setTransformNotice(null);
    setTransformError(null);
    setTransformCopyNotice(null);
    setLastTransformResult(null);

    try {
      const nextValue = await transform(currentValue);
      if (selectedContext) {
        replaceJsonEditSelection(selectedContext, nextValue);
        onValueChange(selectedContext.editor.getValue());
        editSearch.refreshSearch();
        setTransformNotice(t('edit.transformedSelection'));
        setLastTransformResult(nextValue);
        setHasActiveSelection(true);
        return;
      }

      replaceEditorValue(nextValue);
      setTransformNotice(t('edit.transformedDocument'));
      setLastTransformResult(nextValue);
      setHasActiveSelection(false);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setTransformError(t('edit.transformFailed', { message }));
    }
  };

  const handleCopyTransformResult = async () => {
    if (!lastTransformResult || isBusy) {
      return;
    }

    setTransformCopyNotice(null);
    setTransformError(null);
    try {
      await writeTextToClipboard(lastTransformResult);
      setTransformCopyNotice(t('edit.copiedTransformResult'));
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setTransformError(t('edit.copyTransformResultFailed', { message }));
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
              placeholder={t('edit.searchPlaceholder')}
              searchOptions={editSearch.searchOptions}
              onChange={editSearch.handleSearchTermChange}
              onSearchOptionsChange={editSearch.handleSearchOptionsChange}
              onLoadMore={editSearch.loadMoreSearch}
              onPrev={editSearch.goToPreviousMatch}
              onNext={editSearch.goToNextMatch}
              onClose={editSearch.closeFind}
            />
          )}
          <JsonMonacoEditor
            key={`modal-editor-${sessionKey}`}
            defaultLanguage="json"
            defaultValue={initialValue}
            isDarkMode={isDarkMode}
            largeMode={false}
            wrapLongLines
            readOnly={isBusy}
            onMount={handleEditorMount}
            onChange={(value) => onValueChange(value ?? '')}
            height="100%"
          />
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onSave} disabled={isBusy}>
            {saveLabel}
          </button>
          <div className="modal-copy-group">
            <button type="button" onClick={() => void handleTransformContent(onUnescapeContent)} disabled={isBusy}>
              {t('edit.unescapeContent')}
            </button>
            <button type="button" onClick={() => void handleTransformContent(onEscapeContent)} disabled={isBusy}>
              {t('edit.escapeContent')}
            </button>
            <span className="modal-copy-hint">
              {transformNotice ??
                (hasActiveSelection ? t('edit.transformScopeSelection') : t('edit.transformScopeDocument'))}
            </span>
            {lastTransformResult && (
              <button type="button" onClick={() => void handleCopyTransformResult()} disabled={isBusy}>
                {t('edit.copyTransformResult')}
              </button>
            )}
            {transformCopyNotice && <span className="modal-copy-hint">{transformCopyNotice}</span>}
          </div>
          <div className="modal-copy-group">
            <button type="button" onClick={onCopyLiteral} disabled={isBusy}>
              {t('edit.copyLiteral')}
            </button>
            {hasCopiedLiteral && <span className="modal-copy-hint">{t('edit.copiedLiteral')}</span>}
          </div>
          <button type="button" onClick={onClose} disabled={isBusy}>
            {t('edit.cancel')}
          </button>
        </div>

        {busyLabel && <div className="modal-error">{busyLabel}</div>}
        {error && <div className="modal-error">{error}</div>}
        {transformError && <div className="modal-error">{transformError}</div>}
      </div>
    </div>
  );
};

export default JsonEditModal;
