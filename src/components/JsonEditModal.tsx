import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import PaneFindWidget from './PaneFindWidget';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import type { JsonSearchOptions } from '../types/jsonTool';
import { getMonacoSearchBatch } from '../utils/jsonEditorInteractions';

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
  const searchDecorationIdsRef = useRef<string[]>([]);
  const isBusyRef = useRef(isBusy);
  const isFindOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const closeFindRef = useRef<() => void>(() => undefined);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOptions, setSearchOptions] = useState<JsonSearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [searchMatches, setSearchMatches] = useState<monaco.Range[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchNextOffset, setSearchNextOffset] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);

  const normalizedSearchIndex = searchMatches.length > 0
    ? ((searchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length
    : 0;

  const clearSearchDecorations = useCallback(() => {
    if (editorRef.current && searchDecorationIdsRef.current.length > 0) {
      searchDecorationIdsRef.current = editorRef.current.deltaDecorations(
        searchDecorationIdsRef.current,
        []
      );
    }
  }, []);

  const closeFind = useCallback(() => {
    setIsFindOpen(false);
    setSearchTerm('');
    setSearchMatches([]);
    setSearchIndex(0);
    setSearchHasMore(false);
    setSearchNextOffset(0);
    clearSearchDecorations();
    editorRef.current?.focus();
  }, [clearSearchDecorations]);

  const openFind = useCallback(() => {
    setIsFindOpen(true);
  }, []);

  useEffect(() => {
    isBusyRef.current = isBusy;
    isFindOpenRef.current = isFindOpen;
    onCloseRef.current = onClose;
    closeFindRef.current = closeFind;
  }, [closeFind, isBusy, isFindOpen, onClose]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isBusyRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && modalRef.current?.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
        if (isFindOpenRef.current) {
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

  useEffect(() => {
    if (!isFindOpen || !searchTerm) {
      setSearchMatches([]);
      setSearchIndex(0);
      setSearchHasMore(false);
      setSearchNextOffset(0);
      clearSearchDecorations();
      return;
    }

    const timerId = window.setTimeout(() => {
      const model = editorRef.current?.getModel();
      if (!model) {
        return;
      }

      const result = getMonacoSearchBatch(
        model,
        searchTerm,
        searchOptions,
        0,
        EDIT_MODAL_SEARCH_BATCH_SIZE
      );
      setSearchMatches(result.ranges);
      setSearchIndex(0);
      setSearchHasMore(result.hasMore);
      setSearchNextOffset(result.nextStartOffset);
    }, 80);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    clearSearchDecorations,
    editorRevision,
    isFindOpen,
    searchOptions,
    searchTerm,
  ]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isFindOpen || !searchTerm) {
      clearSearchDecorations();
      return;
    }

    const nextDecorations = searchMatches.map((range, index) => ({
      range,
      options: {
        inlineClassName:
          index === normalizedSearchIndex ? 'currentSearchHighlight' : 'searchHighlight',
      },
    }));

    searchDecorationIdsRef.current = editor.deltaDecorations(
      searchDecorationIdsRef.current,
      nextDecorations
    );

    const activeMatch = searchMatches[normalizedSearchIndex];
    if (!activeMatch) {
      return;
    }

    editor.revealRangeInCenter(activeMatch);
    editor.setSelection(
      new monaco.Selection(
        activeMatch.startLineNumber,
        activeMatch.startColumn,
        activeMatch.endLineNumber,
        activeMatch.endColumn
      )
    );
  }, [
    clearSearchDecorations,
    isFindOpen,
    normalizedSearchIndex,
    searchMatches,
    searchTerm,
  ]);

  useEffect(() => () => {
    clearSearchDecorations();
  }, [clearSearchDecorations]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidDispose(() => {
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    });
    editor.onDidChangeModelContent(() => {
      setEditorRevision((current) => current + 1);
    });

    window.setTimeout(() => {
      editor.focus();
    }, 0);

    editor.addCommand(monaco.KeyCode.Escape, () => {
      if (isBusyRef.current) {
        return;
      }

      if (isFindOpenRef.current) {
        closeFindRef.current();
      } else {
        onCloseRef.current();
      }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      openFind();
    });
  };

  const handleSearchOptionsChange = (value: JsonSearchOptions) => {
    setSearchOptions(value);
    setSearchIndex(0);
    setSearchHasMore(false);
    setSearchNextOffset(0);
  };

  const loadMoreSearch = () => {
    if (!searchTerm || !searchHasMore) {
      return;
    }

    const model = editorRef.current?.getModel();
    if (!model) {
      return;
    }

    const result = getMonacoSearchBatch(
      model,
      searchTerm,
      searchOptions,
      searchNextOffset,
      EDIT_MODAL_SEARCH_BATCH_SIZE
    );
    setSearchMatches((current) => [...current, ...result.ranges]);
    setSearchHasMore(result.hasMore);
    setSearchNextOffset(result.nextStartOffset);
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
    setEditorRevision((current) => current + 1);
  }, [onValueChange]);

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
          {isFindOpen && (
            <PaneFindWidget
              value={searchTerm}
              currentIndex={searchMatches.length > 0 ? normalizedSearchIndex + 1 : 0}
              matchCount={searchMatches.length}
              hasMore={searchHasMore}
              isDarkMode={isDarkMode}
              placeholder="搜索编辑内容"
              searchOptions={searchOptions}
              onChange={(value) => {
                setSearchTerm(value);
                setSearchIndex(0);
                setSearchHasMore(false);
                setSearchNextOffset(0);
              }}
              onSearchOptionsChange={handleSearchOptionsChange}
              onLoadMore={loadMoreSearch}
              onPrev={() => {
                if (searchMatches.length > 0) {
                  setSearchIndex((current) => (current - 1 + searchMatches.length) % searchMatches.length);
                }
              }}
              onNext={() => {
                if (searchMatches.length > 0) {
                  setSearchIndex((current) => (current + 1) % searchMatches.length);
                }
              }}
              onClose={closeFind}
            />
          )}
          <Editor
            key={`modal-editor-${sessionKey}`}
            defaultLanguage="json"
            defaultValue={initialValue}
            theme={isDarkMode ? 'vs-dark' : 'vs-light'}
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
