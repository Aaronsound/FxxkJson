// @vitest-environment node
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { describe, expect, it, vi } from 'vitest';
import {
  bindEditorFocusContext,
  getContentAfterSelectionReplace,
  registerPaneFindAction,
  registerPasteContentTracking,
  registerSelectAllDeleteCommands,
} from './jsonEditorMountActions';

function getEditor(overrides: Record<string, unknown> = {}) {
  return {
    addAction: vi.fn(),
    addCommand: vi.fn(),
    createContextKey: vi.fn(() => ({ set: vi.fn() })),
    getModel: vi.fn(),
    hasTextFocus: vi.fn(() => false),
    onDidBlurEditorText: vi.fn(),
    onDidFocusEditorText: vi.fn(),
    trigger: vi.fn(),
    ...overrides,
  } as unknown as Monaco.editor.IStandaloneCodeEditor;
}

describe('registerPasteContentTracking', () => {
  it('tracks pasted editor content after Monaco handles the native paste event', () => {
    let pasteListener: (() => void) | undefined;
    const onPasteContent = vi.fn();
    const editor = {
      getModel: vi.fn(() => ({
        getValue: () => '{"name":"HanJson"}',
      })),
      onDidPaste: vi.fn((listener) => {
        pasteListener = listener;
      }),
    } as unknown as Monaco.editor.IStandaloneCodeEditor;

    registerPasteContentTracking(editor, { onPasteContent });
    pasteListener?.();

    expect(onPasteContent).toHaveBeenCalledWith('{"name":"HanJson"}');
  });
});

describe('json editor mount actions', () => {
  it('tracks focus context changes', () => {
    let focusListener: (() => void) | undefined;
    let blurListener: (() => void) | undefined;
    const contextKey = { set: vi.fn() };
    const editor = getEditor({
      createContextKey: vi.fn(() => contextKey),
      onDidBlurEditorText: vi.fn((listener) => {
        blurListener = listener;
      }),
      onDidFocusEditorText: vi.fn((listener) => {
        focusListener = listener;
      }),
    });

    bindEditorFocusContext(editor, 'focused');
    focusListener?.();
    blurListener?.();

    expect(contextKey.set).toHaveBeenNthCalledWith(1, true);
    expect(contextKey.set).toHaveBeenNthCalledWith(2, false);
  });

  it('builds replacement text and registers find actions', () => {
    const selection = {
      getEndPosition: () => ({ column: 5, lineNumber: 1 }),
      getStartPosition: () => ({ column: 2, lineNumber: 1 }),
    } as Monaco.Selection;
    const model = {
      getOffsetAt: vi.fn((position: Monaco.IPosition) => position.column - 1),
      getValue: vi.fn(() => 'abcd'),
    } as unknown as Monaco.editor.ITextModel;
    const editor = getEditor();
    const openFind = vi.fn();
    const monacoApi = {
      KeyCode: { KeyF: 1 },
      KeyMod: { CtrlCmd: 2 },
    } as unknown as typeof Monaco;

    expect(getContentAfterSelectionReplace(model, selection, 'XYZ')).toBe('aXYZ');
    registerPaneFindAction(monacoApi, editor, {
      actionId: 'find',
      focusContextKey: 'focused',
      label: 'Find',
      onOpen: openFind,
    });
    const action = vi.mocked(editor.addAction).mock.calls[0]?.[0];
    action?.run(editor);
    expect(openFind).toHaveBeenCalledTimes(1);
  });

  it('delegates whole-document and regular delete commands', () => {
    const editor = getEditor();
    const monacoApi = {
      KeyCode: { Backspace: 2, Delete: 1 },
    } as unknown as typeof Monaco;
    const onClearAll = vi.fn();
    const selectionCoversModel = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);

    registerSelectAllDeleteCommands(monacoApi, editor, {
      focusContextKey: 'focused',
      onClearAll,
      selectionCoversModel,
    });
    const deleteCommand = vi.mocked(editor.addCommand).mock.calls[0]?.[1];
    const backspaceCommand = vi.mocked(editor.addCommand).mock.calls[1]?.[1];
    deleteCommand?.();
    backspaceCommand?.();

    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(editor.trigger).toHaveBeenCalledWith('', 'deleteLeft', null);
  });
});
