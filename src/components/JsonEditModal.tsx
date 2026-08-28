import type { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditModalSearch } from '../hooks/useEditModalSearch';
import { useJsonEditFolding } from '../hooks/useJsonEditFolding';
import { writeTextToClipboard } from '../utils/clipboard';
import { getViewportContextMenuPosition } from '../utils/contextMenuPosition';
import { createTranslator, type I18nKey } from '../utils/i18n';
import {
  enableLargeEditModelFolding,
  type FoldingContribution,
  getNativeFoldingControlCount,
  prepareLargeEditModel,
  refreshEditFoldingControls,
} from '../utils/jsonEditFolding';
import {
  getJsonEditSelectionContext,
  hasJsonEditSelection,
  replaceJsonEditDocument,
  replaceJsonEditSelection,
  runWritableEditorEdit,
} from '../utils/jsonEditModalTransforms';
import JsonMonacoEditor from './JsonMonacoEditor';
import OperationNotice from './OperationNotice';
import PaneFindWidget from './PaneFindWidget';
import ContextMenuSurface from './ContextMenuSurface';

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
    getFoldingConfig: () => {
      folding: boolean;
      foldingMaximumRegions: number;
      largeFileOptimizations: boolean;
      showFoldingControls: string;
    };
    getValue: () => string;
    getVisibleFoldingControlCount: () => number;
    getDebugInfo?: () => Record<string, unknown>;
    __editor?: monaco.editor.IStandaloneCodeEditor;
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
  const [transformError, setTransformError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
  } | null>(null);
  const editSearch = useEditModalSearch({
    editorRef,
    searchBatchSize: EDIT_MODAL_SEARCH_BATCH_SIZE,
  });
  const editModelPath = `fxxkjson-edit-${sessionKey}.json`;
  const {
    clearEditFoldControls,
    foldControls,
    foldOverlayLeft,
    handleToggleFoldControl,
    resetEditFoldControls,
    scheduleFoldControlsUpdate,
  } = useJsonEditFolding(editorRef);

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
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
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
  }, [contextMenu, editSearch.openFind]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    enableLargeEditModelFolding(editor);
    const editModel = editor.getModel();
    const e2eWindow = window as JsonEditModalE2EWindow;
    if (e2eWindow.__HANJSON_E2E__) {
      e2eWindow.__HANJSON_E2E_EDIT_MODAL__ = {
        __editor: editor,
        getFoldingConfig() {
          const rawOptions = editor.getRawOptions() as {
            folding?: boolean;
            foldingMaximumRegions?: number;
            largeFileOptimizations?: boolean;
            showFoldingControls?: string;
          };

          return {
            folding: rawOptions.folding ?? editor.getOption(monaco.editor.EditorOption.folding),
            foldingMaximumRegions:
              rawOptions.foldingMaximumRegions ?? editor.getOption(monaco.editor.EditorOption.foldingMaximumRegions),
            largeFileOptimizations: rawOptions.largeFileOptimizations ?? true,
            showFoldingControls:
              rawOptions.showFoldingControls ??
              String(editor.getOption(monaco.editor.EditorOption.showFoldingControls)),
          };
        },
        getValue() {
          return editor.getValue();
        },
        getVisibleFoldingControlCount() {
          const customFoldingControlCount = document.querySelectorAll(
            '.modal-editor-shell .edit-modal-fold-button'
          ).length;
          return customFoldingControlCount > 0 ? customFoldingControlCount : getNativeFoldingControlCount();
        },
        getDebugInfo() {
          const model = editor.getModel();
          const foldingContribution = editor.getContribution('editor.contrib.folding') as
            | (FoldingContribution & {
                foldingModel?: { regions?: { length?: number } };
                rangeProvider?: { constructor?: { name?: string } };
              })
            | null;

          return {
            config: this.getFoldingConfig(),
            language: model?.getLanguageId(),
            lineCount: model?.getLineCount(),
            visibleFoldingControlCount: this.getVisibleFoldingControlCount(),
            foldingRegionCount: foldingContribution?.foldingModel?.regions?.length ?? null,
            rangeProvider: foldingContribution?.rangeProvider?.constructor?.name ?? null,
          };
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
      clearEditFoldControls();
      editModel?.dispose();
    });
    editor.onDidChangeModelContent(() => {
      resetEditFoldControls(editor);
      editSearch.captureSearchAnchor(editor);
      editSearch.refreshSearch();
    });
    editor.onDidScrollChange(scheduleFoldControlsUpdate);
    refreshEditFoldingControls(editor);
    scheduleFoldControlsUpdate();
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

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener('pointerdown', closeContextMenu);
    window.addEventListener('blur', closeContextMenu);

    return () => {
      window.removeEventListener('pointerdown', closeContextMenu);
      window.removeEventListener('blur', closeContextMenu);
    };
  }, [contextMenu]);

  const replaceEditorValue = useCallback(
    (nextValue: string) => {
      const editor = editorRef.current;
      resetEditFoldControls(editor);
      replaceJsonEditDocument(editor, nextValue);

      onValueChange(nextValue);
      editSearch.refreshSearch();
      resetEditFoldControls(editor);
    },
    [editSearch, onValueChange, resetEditFoldControls]
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

    setTransformError(null);

    try {
      const nextValue = await transform(currentValue);
      if (selectedContext) {
        resetEditFoldControls(selectedContext.editor);
        replaceJsonEditSelection(selectedContext, nextValue);
        onValueChange(selectedContext.editor.getValue());
        editSearch.refreshSearch();
        resetEditFoldControls(selectedContext.editor);
        return;
      }

      replaceEditorValue(nextValue);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setTransformError(t('edit.transformFailed', { message }));
    }
  };

  const handleCopySelection = async () => {
    if (isBusy) {
      return;
    }

    const selectedContext = getJsonEditSelectionContext(editorRef.current);
    if (!selectedContext) {
      return;
    }

    setTransformError(null);
    try {
      await writeTextToClipboard(selectedContext.model.getValueInRange(selectedContext.selection));
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setTransformError(t('edit.copySelectionFailed', { message }));
    }
  };

  const runContextAction = async (action: () => void | Promise<void>) => {
    setContextMenu(null);
    await action();
  };

  const openEditorContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isBusy) {
      return;
    }

    const position = getViewportContextMenuPosition(event.clientX, event.clientY, 4);
    setContextMenu({
      ...position,
      hasSelection: hasJsonEditSelection(editorRef.current),
    });
  };

  return (
    <div className="modal-overlay" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="json-edit-title">
      <div className={isDarkMode ? 'modal-card modal-card-dark' : 'modal-card'}>
        <div className="modal-header">
          <h3 id="json-edit-title">{title}</h3>
          {pathText && (
            <div className="modal-path" title={pathText}>
              {pathText}
            </div>
          )}
        </div>

        <div className="modal-editor-shell" onContextMenu={openEditorContextMenu}>
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
              t={t}
            />
          )}
          <JsonMonacoEditor
            key={`modal-editor-${sessionKey}`}
            defaultLanguage="json"
            path={editModelPath}
            defaultValue={initialValue}
            enableStructuralFolding
            isDarkMode={isDarkMode}
            largeMode={false}
            preserveStructuralFolding
            wrapLongLines
            readOnly={isBusy}
            beforeMount={(editorApi) => prepareLargeEditModel(editorApi, editModelPath, initialValue)}
            onMount={handleEditorMount}
            onChange={(value) => onValueChange(value ?? '')}
            height="100%"
          />
          <div
            className="edit-modal-fold-overlay"
            aria-hidden="true"
            style={foldOverlayLeft === null ? undefined : { left: `${foldOverlayLeft}px` }}
          >
            {foldControls.map((control) => (
              <button
                type="button"
                key={`${control.lineNumber}-${control.index}`}
                className={`edit-modal-fold-button ${control.collapsed ? 'collapsed' : 'expanded'}`}
                data-end-line-number={control.endLineNumber}
                data-line-number={control.lineNumber}
                style={{ top: `${control.top}px` }}
                tabIndex={-1}
                title={control.collapsed ? '展开' : '折叠'}
                onClick={() => handleToggleFoldControl(control)}
              />
            ))}
          </div>
          {contextMenu && (
            <ContextMenuSurface
              ariaLabel={t('editorContext.menuLabel')}
              isDarkMode={isDarkMode}
              onClose={() => setContextMenu(null)}
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <div className="large-json-context-menu-group" role="group" aria-label={t('context.editGroup')}>
                <button
                  type="button"
                  role="menuitem"
                  className="large-json-context-menu-item"
                  onClick={() => runContextAction(() => handleTransformContent(onEscapeContent))}
                >
                  {contextMenu.hasSelection ? t('edit.contextEscapeSelection') : t('edit.contextEscapeDocument')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="large-json-context-menu-item"
                  onClick={() => runContextAction(() => handleTransformContent(onUnescapeContent))}
                >
                  {contextMenu.hasSelection ? t('edit.contextUnescapeSelection') : t('edit.contextUnescapeDocument')}
                </button>
              </div>
              <div className="large-json-context-menu-group" role="group" aria-label={t('context.copyGroup')}>
                <button
                  type="button"
                  role="menuitem"
                  className="large-json-context-menu-item"
                  disabled={!contextMenu.hasSelection}
                  onClick={() => runContextAction(handleCopySelection)}
                >
                  {t('editorContext.copy')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="large-json-context-menu-item"
                  onClick={() => runContextAction(onCopyLiteral)}
                >
                  {t('edit.copyLiteral')}
                </button>
              </div>
            </ContextMenuSurface>
          )}
        </div>

        {busyLabel && <div className="modal-error">{busyLabel}</div>}
        {error && <div className="modal-error">{error}</div>}
        {transformError && <div className="modal-error">{transformError}</div>}
        {hasCopiedLiteral && <OperationNotice>{t('edit.copiedLiteral')}</OperationNotice>}

        <div className="modal-actions">
          <button type="button" onClick={onSave} disabled={isBusy}>
            {saveLabel}
          </button>
          <button type="button" onClick={onClose} disabled={isBusy}>
            {t('edit.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JsonEditModal;
