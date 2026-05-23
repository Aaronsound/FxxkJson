import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { RightEditorContextMenuState } from '../components/RightEditorContextMenu';
import type { StructureStatus } from '../types/jsonTool';
import { getViewportContextMenuPosition } from '../utils/contextMenuPosition';
import { bindEditorFocusContext, registerPaneFindAction } from '../utils/jsonEditorMountActions';

type RightNodeMutationOperation = 'delete-node' | 'rename-node-key';
type CopyNodeDetailMode = 'path' | 'key' | 'compact-json' | 'formatted-json';

interface UseRightEditorActionsArgs {
  activeTabIdRef: MutableRefObject<string>;
  applyRightNodeMutationAtOffset: (
    tabId: string,
    offset: number,
    preferCachedText: boolean,
    operation: RightNodeMutationOperation
  ) => Promise<void>;
  copyNodeDetailAtOffset: (
    tabId: string,
    offset: number,
    preferCachedText: boolean,
    mode: CopyNodeDetailMode
  ) => Promise<void>;
  copyValueAtOffset: (tabId: string, offset: number, preferCachedText?: boolean) => Promise<void>;
  handleOpenEditNodeAtOffset: (tabId: string, offset: number, preferCachedText?: boolean) => Promise<void>;
  handleOpenUnescapedNodeAtOffset: (tabId: string, offset: number, preferCachedText?: boolean) => Promise<void>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  openRightFind: () => void;
  requestWorkerLocate: (tabId: string, offset: number) => void;
  rightContextMenuOffsetByTabRef: MutableRefObject<Record<string, number | null>>;
  rightEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  rightViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  setRightEditorContextMenu: Dispatch<SetStateAction<RightEditorContextMenuState | null>>;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
  syncRightModel: (tabId: string, content: string, forceValue?: boolean) => void;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
  logRightEditorState: (event: string, tabId: string, extra?: Record<string, unknown>) => void;
  wrapLongLines: boolean;
}

export function useRightEditorActions({
  activeTabIdRef,
  applyRightNodeMutationAtOffset,
  copyNodeDetailAtOffset,
  copyValueAtOffset,
  formattedTextByTabRef,
  handleOpenEditNodeAtOffset,
  handleOpenUnescapedNodeAtOffset,
  largeModeRef,
  logRightEditorState,
  openRightFind,
  requestWorkerLocate,
  rightContextMenuOffsetByTabRef,
  rightEditorRef,
  rightViewStateByTabRef,
  setRightEditorContextMenu,
  structureStatusRef,
  syncRightModel,
  workerStructureEnabledRef,
  wrapLongLines,
}: UseRightEditorActionsArgs) {
  return (editor: monaco.editor.IStandaloneCodeEditor) => {
    rightEditorRef.current = editor;
    const currentTabId = activeTabIdRef.current;
    syncRightModel(currentTabId, formattedTextByTabRef.current[currentTabId] ?? '', true);
    const rightEditorFocusContextKey = 'fxxkjsonRightEditorFocused';
    logRightEditorState('right-editor-mounted', currentTabId, {
      wrapLongLines,
    });

    editor.onDidDispose(() => {
      if (rightEditorRef.current === editor) {
        rightEditorRef.current = null;
      }
    });

    bindEditorFocusContext(editor, rightEditorFocusContextKey);

    const getRightActionOffset = (mountedEditor: monaco.editor.ICodeEditor) => {
      const currentTabId = activeTabIdRef.current;
      const model = mountedEditor.getModel();

      if (!model) {
        return null;
      }

      const contextMenuOffset = rightContextMenuOffsetByTabRef.current[currentTabId];
      if (typeof contextMenuOffset === 'number') {
        rightContextMenuOffsetByTabRef.current[currentTabId] = null;
        return { tabId: currentTabId, offset: contextMenuOffset };
      }

      const position = mountedEditor.getPosition();
      if (!position) {
        return null;
      }

      return { tabId: currentTabId, offset: model.getOffsetAt(position) };
    };

    editor.onContextMenu((event) => {
      const currentTabId = activeTabIdRef.current;
      const model = editor.getModel();
      const position = event.target.position ?? editor.getPosition();
      const browserEvent = event.event.browserEvent as MouseEvent | undefined;

      event.event.preventDefault();
      event.event.stopPropagation();

      if (!model || !position) {
        rightContextMenuOffsetByTabRef.current[currentTabId] = null;
        setRightEditorContextMenu(null);
        return;
      }

      const offset = model.getOffsetAt(position);
      const menuPosition = getViewportContextMenuPosition(
        browserEvent?.clientX ?? event.event.posx ?? 0,
        browserEvent?.clientY ?? event.event.posy ?? 0,
        10
      );
      rightContextMenuOffsetByTabRef.current[currentTabId] = offset;
      setRightEditorContextMenu({
        tabId: currentTabId,
        offset,
        x: menuPosition.x,
        y: menuPosition.y,
      });
    });

    editor.onMouseDown((event) => {
      if (event.event.rightButton) {
        return;
      }

      rightContextMenuOffsetByTabRef.current[activeTabIdRef.current] = null;
      setRightEditorContextMenu(null);
    });

    editor.onDidChangeCursorPosition((event) => {
      const currentTabId = activeTabIdRef.current;

      if (
        largeModeRef.current[currentTabId] ||
        !workerStructureEnabledRef.current[currentTabId] ||
        structureStatusRef.current[currentTabId] !== 'ready'
      ) {
        return;
      }

      const rightModel = editor.getModel();

      if (!rightModel || (event.position.lineNumber === 1 && event.position.column === 1)) {
        return;
      }

      requestWorkerLocate(currentTabId, rightModel.getOffsetAt(event.position));
    });

    editor.onMouseUp(() => {
      const currentTabId = activeTabIdRef.current;

      if (!largeModeRef.current[currentTabId] || !workerStructureEnabledRef.current[currentTabId]) {
        return;
      }

      if (structureStatusRef.current[currentTabId] !== 'ready') {
        return;
      }

      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) {
        return;
      }

      requestWorkerLocate(currentTabId, model.getOffsetAt(position));
    });

    editor.onDidChangeHiddenAreas(() => {
      const currentTabId = activeTabIdRef.current;
      rightViewStateByTabRef.current[currentTabId] = editor.saveViewState() ?? null;
    });

    registerPaneFindAction(monaco, editor, {
      actionId: 'openRightPaneFind',
      label: '搜索格式化结果',
      focusContextKey: rightEditorFocusContextKey,
      onOpen: openRightFind,
    });

    const addOffsetAction = (
      id: string,
      label: string,
      contextMenuOrder: number,
      action: (tabId: string, offset: number) => Promise<void>
    ) => {
      editor.addAction({
        id,
        label,
        contextMenuGroupId: 'navigation',
        contextMenuOrder,
        run: async (mountedEditor) => {
          const actionOffset = getRightActionOffset(mountedEditor);
          if (!actionOffset) {
            return;
          }

          await action(actionOffset.tabId, actionOffset.offset);
        },
      });
    };

    addOffsetAction('copyJsonPathAction', '复制 JSON Path', 1, (tabId, offset) =>
      copyNodeDetailAtOffset(tabId, offset, true, 'path')
    );
    addOffsetAction('copyKeyAction', '复制 key', 2, (tabId, offset) =>
      copyNodeDetailAtOffset(tabId, offset, true, 'key')
    );
    addOffsetAction('copyValueAction', '复制值', 3, (tabId, offset) => copyValueAtOffset(tabId, offset));
    addOffsetAction('copyCompactJsonAction', '复制压缩 JSON', 4, (tabId, offset) =>
      copyNodeDetailAtOffset(tabId, offset, true, 'compact-json')
    );
    addOffsetAction('copyFormattedJsonAction', '复制格式化 JSON', 5, (tabId, offset) =>
      copyNodeDetailAtOffset(tabId, offset, true, 'formatted-json')
    );
    addOffsetAction('editValueAction', '编辑当前值', 6, (tabId, offset) => handleOpenEditNodeAtOffset(tabId, offset));
    addOffsetAction('renameKeyAction', '重命名 key', 7, (tabId, offset) =>
      applyRightNodeMutationAtOffset(tabId, offset, true, 'rename-node-key')
    );
    addOffsetAction('deleteNodeAction', '删除当前节点', 8, (tabId, offset) =>
      applyRightNodeMutationAtOffset(tabId, offset, true, 'delete-node')
    );
    addOffsetAction('unescapeValueAction', '反转义当前值', 9, (tabId, offset) =>
      handleOpenUnescapedNodeAtOffset(tabId, offset)
    );
  };
}
