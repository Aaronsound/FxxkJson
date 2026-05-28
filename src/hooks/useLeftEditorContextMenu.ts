import { useEffect, useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { LeftEditorContextMenuState } from '../components/LeftEditorContextMenu';
import type { Tab } from '../types/jsonTool';
import { readTextFromClipboard, writeTextToClipboard } from '../utils/clipboard';
import { getViewportContextMenuPosition } from '../utils/contextMenuPosition';
import { getContentAfterSelectionReplace } from '../utils/jsonEditorMountActions';
import { getUtf8ByteLength, shouldUseLargeMode } from '../utils/jsonDocumentMetrics';

interface UseLeftEditorContextMenuArgs {
  activeTab: Tab | null;
  beginPerformanceSession: (
    tabId: string,
    trigger: 'paste',
    label: string,
    fileSize: number | null,
    rawBytes: number,
    largeMode: boolean
  ) => void;
  leftEditorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  setTabError: (tabId: string, error: string | null) => void;
}

export function useLeftEditorContextMenu({
  activeTab,
  beginPerformanceSession,
  leftEditorRef,
  setTabError,
}: UseLeftEditorContextMenuArgs) {
  const [leftEditorContextMenu, setLeftEditorContextMenu] = useState<LeftEditorContextMenuState | null>(null);

  useEffect(() => {
    if (!leftEditorContextMenu) {
      return;
    }

    const closeMenu = () => setLeftEditorContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [leftEditorContextMenu]);

  const beginPastePerformanceSession = (tabId: string, nextContent: string) => {
    beginPerformanceSession(
      tabId,
      'paste',
      '剪贴板粘贴',
      null,
      getUtf8ByteLength(nextContent),
      shouldUseLargeMode(nextContent)
    );
  };

  const copyLeftEditorSelection = async () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();

    if (!editor || !model || !selection || selection.isEmpty()) {
      return;
    }

    await writeTextToClipboard(model.getValueInRange(selection));
    editor.focus();
  };

  const cutLeftEditorSelection = async () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();

    if (!editor || !model || !selection || selection.isEmpty()) {
      return;
    }

    await writeTextToClipboard(model.getValueInRange(selection));
    editor.focus();
    editor.executeEdits('left-editor-context-menu-cut', [
      {
        range: selection,
        text: '',
        forceMoveMarkers: true,
      },
    ]);
    editor.pushUndoStop();
  };

  const pasteIntoLeftEditor = async () => {
    if (!activeTab) {
      return;
    }

    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();

    if (!editor || !model || !selection) {
      return;
    }

    try {
      const clipboardText = await readTextFromClipboard();
      if (!clipboardText) {
        editor.focus();
        return;
      }

      beginPastePerformanceSession(activeTab.id, getContentAfterSelectionReplace(model, selection, clipboardText));
      editor.focus();
      editor.executeEdits('left-editor-context-menu-paste', [
        {
          range: selection,
          text: clipboardText,
          forceMoveMarkers: true,
        },
      ]);
      editor.pushUndoStop();
    } catch (error) {
      setTabError(activeTab.id, error instanceof Error ? `粘贴失败：${error.message}` : '粘贴失败');
    }
  };

  const selectAllLeftEditorText = () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model) {
      return;
    }

    editor.focus();
    editor.setSelection(model.getFullModelRange());
  };

  const registerLeftEditorContextMenu = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editor.onContextMenu((event) => {
      const browserEvent = event.event.browserEvent as MouseEvent | undefined;
      const position = event.target.position ?? editor.getPosition();
      const selection = editor.getSelection();
      const hasSelection = Boolean(selection && !selection.isEmpty());
      const rightClickIsInsideSelection = Boolean(hasSelection && position && selection?.containsPosition(position));

      event.event.preventDefault();
      event.event.stopPropagation();

      if (position && !rightClickIsInsideSelection) {
        editor.setPosition(position);
      }

      const menuPosition = getViewportContextMenuPosition(
        browserEvent?.clientX ?? event.event.posx ?? 0,
        browserEvent?.clientY ?? event.event.posy ?? 0,
        4
      );
      setLeftEditorContextMenu({
        x: menuPosition.x,
        y: menuPosition.y,
        hasSelection,
      });
    });

    editor.onMouseDown((event) => {
      if (!event.event.rightButton) {
        setLeftEditorContextMenu(null);
      }
    });
  };

  return {
    copyLeftEditorSelection,
    cutLeftEditorSelection,
    leftEditorContextMenu,
    pasteIntoLeftEditor,
    registerLeftEditorContextMenu,
    selectAllLeftEditorText,
    setLeftEditorContextMenu,
  };
}
