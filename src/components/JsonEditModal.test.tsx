import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JsonEditModal from './JsonEditModal';

const mockEditorState = vi.hoisted(() => {
  class MockRange {
    startLineNumber: number;

    startColumn: number;

    endLineNumber: number;

    endColumn: number;

    constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  }

  class MockSelection extends MockRange {
    getStartPosition() {
      return {
        lineNumber: this.startLineNumber,
        column: this.startColumn,
      };
    }

    getEndPosition() {
      return {
        lineNumber: this.endLineNumber,
        column: this.endColumn,
      };
    }
  }

  const keyCode = {
    Escape: 9,
    KeyF: 36,
  };
  const keyMod = {
    CtrlCmd: 2048,
  };

  return {
    editor: null as MockEditor | null,
    keyCode,
    keyMod,
    MockRange,
    MockSelection,
  };
});

class MockTextModel {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  setValue(value: string) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  getLineCount() {
    return this.value.split('\n').length;
  }

  getLineMaxColumn(lineNumber: number) {
    return this.value.split('\n')[lineNumber - 1].length + 1;
  }

  getOffsetAt(position: { lineNumber: number; column: number }) {
    const lines = this.value.split('\n');
    let offset = 0;

    for (let index = 0; index < position.lineNumber - 1; index += 1) {
      offset += lines[index].length + 1;
    }

    return offset + position.column - 1;
  }

  getPositionAt(offset: number) {
    const lines = this.value.split('\n');
    let remaining = Math.max(0, Math.min(offset, this.value.length));

    for (let index = 0; index < lines.length; index += 1) {
      const lineLength = lines[index].length;
      if (remaining <= lineLength) {
        return {
          lineNumber: index + 1,
          column: remaining + 1,
        };
      }

      remaining -= lineLength + 1;
    }

    return {
      lineNumber: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  getFullModelRange() {
    const lineCount = this.getLineCount();
    return new mockEditorState.MockRange(1, 1, lineCount, this.getLineMaxColumn(lineCount));
  }

  getValueInRange(range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) {
    const startOffset = this.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn });
    const endOffset = this.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn });

    return this.value.slice(Math.min(startOffset, endOffset), Math.max(startOffset, endOffset));
  }
}

class MockEditor {
  model: MockTextModel;

  commands = new Map<number, () => void>();

  contentListeners: Array<() => void> = [];

  cursorSelectionListeners: Array<() => void> = [];

  position: { lineNumber: number; column: number };

  focus = vi.fn();

  revealRangeInCenter = vi.fn();

  selection: InstanceType<typeof mockEditorState.MockSelection> | null = null;

  setSelection = vi.fn((selection: InstanceType<typeof mockEditorState.MockSelection>) => {
    this.selection = selection;
    this.position = selection.getEndPosition();
    this.cursorSelectionListeners.forEach((listener) => listener());
  });

  revealPositionInCenter = vi.fn();

  pushUndoStop = vi.fn();

  readOnly = false;

  constructor(value: string) {
    this.model = new MockTextModel(value);
    this.position = this.model.getPositionAt(value.length);
  }

  getModel() {
    return this.model;
  }

  getPosition() {
    return this.position;
  }

  getSelection() {
    return this.selection;
  }

  getValue() {
    return this.model.getValue();
  }

  onDidDispose() {
    return { dispose: vi.fn() };
  }

  onDidChangeModelContent(listener: () => void) {
    this.contentListeners.push(listener);
    return { dispose: vi.fn() };
  }

  onDidChangeCursorSelection(listener: () => void) {
    this.cursorSelectionListeners.push(listener);
    return { dispose: vi.fn() };
  }

  addCommand(keybinding: number, callback: () => void) {
    this.commands.set(keybinding, callback);
  }

  deltaDecorations(_: string[], decorations: unknown[]) {
    return decorations.map((__, index) => `decoration-${index}`);
  }

  updateOptions = vi.fn((options: { readOnly?: boolean }) => {
    if (typeof options.readOnly === 'boolean') {
      this.readOnly = options.readOnly;
    }
  });

  setPosition(position: { lineNumber: number; column: number }) {
    this.position = position;
  }

  executeEdits(
    _: string,
    edits: Array<{
      range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
      text: string;
    }>
  ) {
    const edit = edits[0];
    if (!edit) {
      return;
    }

    if (this.readOnly) {
      return;
    }

    const currentValue = this.model.getValue();
    const startOffset = this.model.getOffsetAt({
      lineNumber: edit.range.startLineNumber,
      column: edit.range.startColumn,
    });
    const endOffset = this.model.getOffsetAt({
      lineNumber: edit.range.endLineNumber,
      column: edit.range.endColumn,
    });
    this.model.setValue(
      `${currentValue.slice(0, Math.min(startOffset, endOffset))}${edit.text}${currentValue.slice(
        Math.max(startOffset, endOffset)
      )}`
    );
    this.contentListeners.forEach((listener) => listener());
  }
}

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  KeyCode: mockEditorState.keyCode,
  KeyMod: mockEditorState.keyMod,
  Range: mockEditorState.MockRange,
  Selection: mockEditorState.MockSelection,
}));

vi.mock('@monaco-editor/react', async () => {
  const react = await import('react');

  return {
    default: ({
      defaultValue,
      onChange,
      onMount,
    }: {
      defaultValue: string;
      onChange?: (value: string) => void;
      onMount?: (editor: MockEditor) => void;
    }) => {
      const [value, setValue] = react.useState(defaultValue);
      const editorRef = react.useRef<MockEditor | null>(null);

      react.useEffect(() => {
        const editor = new MockEditor(defaultValue);
        editorRef.current = editor;
        mockEditorState.editor = editor;
        onMount?.(editor);
      }, []);

      return (
        <textarea
          aria-label="mock-json-editor"
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);
            editorRef.current?.model.setValue(nextValue);
            editorRef.current?.contentListeners.forEach((listener) => listener());
            onChange?.(nextValue);
          }}
        />
      );
    },
  };
});

const baseProps = {
  sessionKey: 1,
  isDarkMode: false,
  error: null,
  busyLabel: null,
  hasCopiedLiteral: false,
  onValueChange: vi.fn(),
  onSave: vi.fn(),
  onUnescapeContent: vi.fn(async (value: string) => value),
  onEscapeContent: vi.fn(async (value: string) => value),
  onCopyLiteral: vi.fn(),
  onClose: vi.fn(),
};

function renderModal(initialValue: string, props: Partial<React.ComponentProps<typeof JsonEditModal>> = {}) {
  return render(<JsonEditModal {...baseProps} {...props} initialValue={initialValue} />);
}

function openFind() {
  act(() => {
    mockEditorState.editor?.commands.get(mockEditorState.keyMod.CtrlCmd | mockEditorState.keyCode.KeyF)?.();
  });
}

function getFindInput(container: HTMLElement) {
  const input = container.querySelector('.pane-find-input');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Find input was not rendered');
  }

  return input;
}

async function searchForName(container: HTMLElement) {
  openFind();
  fireEvent.change(getFindInput(container), { target: { value: 'name' } });
  await act(async () => {
    vi.advanceTimersByTime(100);
  });
}

describe('JsonEditModal search position', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockEditorState.editor = null;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps a late search match active after editing its value', async () => {
    const { container } = renderModal(
      [
        '{',
        '  "items": [',
        '    { "name": "first" },',
        '    { "name": "second" },',
        '    { "name": "third" }',
        '  ]',
        '}',
      ].join('\n')
    );

    await searchForName(container);
    fireEvent.click(screen.getByRole('button', { name: '下一个' }));
    fireEvent.click(screen.getByRole('button', { name: '下一个' }));
    expect(screen.getByText('3/3')).toBeInTheDocument();

    const revealCountBeforeEdit = mockEditorState.editor?.revealRangeInCenter.mock.calls.length;
    fireEvent.change(screen.getByLabelText('mock-json-editor'), {
      target: {
        value: [
          '{',
          '  "items": [',
          '    { "name": "first" },',
          '    { "name": "second" },',
          '    { "name": "third updated" }',
          '  ]',
          '}',
        ].join('\n'),
      },
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(mockEditorState.editor?.revealRangeInCenter).toHaveBeenCalledTimes(revealCountBeforeEdit ?? 0);
  });

  it('opens modal search from the window find shortcut while focus is inside the modal', async () => {
    const { container } = renderModal('{"name":"first"}');
    const editorElement = screen.getByLabelText('mock-json-editor');

    fireEvent.keyDown(editorElement, {
      key: 'f',
      metaKey: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(getFindInput(container)).toBeInTheDocument();
  });

  it('opens modal search from the Electron find shortcut', async () => {
    let findShortcut: (() => void) | undefined;
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      onFindShortcut: vi.fn((callback) => {
        findShortcut = callback;
        return vi.fn();
      }),
      openJsonFile: vi.fn(),
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText: vi.fn(),
    };
    const { container } = renderModal('{"name":"first"}');

    act(() => {
      findShortcut?.();
    });

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(getFindInput(container)).toBeInTheDocument();
  });

  it('uses clearer transform button labels', () => {
    renderModal('{"name":"first"}');

    expect(screen.getByRole('button', { name: '还原转义内容' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '转成 JSON 字符串' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制 JSON 字符串字面量' })).toBeInTheDocument();
    expect(screen.getByText('未选中内容，将转换整段')).toBeInTheDocument();
  });

  it('keeps the cursor near its previous offset after escaping the full document', async () => {
    const onEscapeContent = vi.fn(async () => '"escaped document value"');
    renderModal('{\n  "name": "first",\n  "age": 18\n}', { onEscapeContent });
    const editor = mockEditorState.editor;

    editor?.setPosition({ lineNumber: 2, column: 5 });
    const previousOffset = editor?.model.getOffsetAt({ lineNumber: 2, column: 5 });

    fireEvent.click(screen.getByRole('button', { name: '转成 JSON 字符串' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onEscapeContent).toHaveBeenCalled();
    expect(editor?.getPosition()).toEqual(editor?.model.getPositionAt(previousOffset ?? 0));
    expect(editor?.getPosition()).not.toEqual(editor?.model.getPositionAt(editor.model.getValue().length));
    expect(editor?.revealPositionInCenter).toHaveBeenCalledWith(editor?.getPosition());
    expect(screen.getByText('已转换整段内容，可保存或复制')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制转换结果' })).toBeInTheDocument();
  });

  it('writes transformed content even if Monaco is still read-only after a busy transform', async () => {
    const onEscapeContent = vi.fn(async () => '"escaped document value"');
    const onValueChange = vi.fn();

    renderModal('{"name":"first"}', { onEscapeContent, onValueChange });
    const editor = mockEditorState.editor;

    editor?.updateOptions({ readOnly: true });

    fireEvent.click(screen.getByRole('button', { name: '转成 JSON 字符串' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(editor?.updateOptions).toHaveBeenCalledWith({ readOnly: false });
    expect(editor?.getValue()).toBe('"escaped document value"');
    expect(onValueChange).toHaveBeenCalledWith('"escaped document value"');
  });

  it('transforms only the selected JSON fragment when a selection exists', async () => {
    const initialValue = ['{', '  "items": [', '    { "name": "first" },', '    { "name": "second" }', '  ]', '}'].join(
      '\n'
    );
    const selectedObject = '{ "name": "second" }';
    const escapedObject = '"{ \\"name\\": \\"second\\" }"';
    const onEscapeContent = vi.fn(async () => escapedObject);
    const onValueChange = vi.fn();

    renderModal(initialValue, { onEscapeContent, onValueChange });
    const editor = mockEditorState.editor;
    if (!editor) {
      throw new Error('Editor was not mounted');
    }

    const selectionStart = initialValue.indexOf(selectedObject);
    const selectionEnd = selectionStart + selectedObject.length;
    const startPosition = editor.model.getPositionAt(selectionStart);
    const endPosition = editor.model.getPositionAt(selectionEnd);

    if (!startPosition || !endPosition) {
      throw new Error('Selection positions were not available');
    }

    act(() => {
      editor.setSelection(
        new mockEditorState.MockSelection(
          startPosition.lineNumber,
          startPosition.column,
          endPosition.lineNumber,
          endPosition.column
        )
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '转成 JSON 字符串' }));

    await act(async () => {
      await Promise.resolve();
    });

    const expectedValue = initialValue.replace(selectedObject, escapedObject);

    expect(onEscapeContent).toHaveBeenCalledWith(selectedObject);
    expect(editor.getValue()).toBe(expectedValue);
    expect(onValueChange).toHaveBeenCalledWith(expectedValue);
    expect(editor.setSelection).toHaveBeenLastCalledWith(
      new mockEditorState.MockSelection(
        startPosition.lineNumber,
        startPosition.column,
        editor.model.getPositionAt(selectionStart + escapedObject.length).lineNumber,
        editor.model.getPositionAt(selectionStart + escapedObject.length).column
      )
    );
    expect(editor.revealRangeInCenter).toHaveBeenCalledWith(editor.selection);
    expect(screen.getByText('已转换选中内容，可直接复制选区')).toBeInTheDocument();
  });

  it('shows selection scope and copies the latest transform result', async () => {
    const escapedObject = '"{\\"name\\":\\"second\\"}"';
    const onEscapeContent = vi.fn(async () => escapedObject);
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      onFindShortcut: vi.fn(),
      openJsonFile: vi.fn(),
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText: vi.fn(),
    };

    renderModal('{"items":[{"name":"first"},{"name":"second"}]}', { onEscapeContent });
    const editor = mockEditorState.editor;
    if (!editor) {
      throw new Error('Editor was not mounted');
    }

    const selectedObject = '{"name":"second"}';
    const selectionStart = editor.getValue().indexOf(selectedObject);
    const startPosition = editor.model.getPositionAt(selectionStart);
    const endPosition = editor.model.getPositionAt(selectionStart + selectedObject.length);
    act(() => {
      editor.setSelection(
        new mockEditorState.MockSelection(
          startPosition.lineNumber,
          startPosition.column,
          endPosition.lineNumber,
          endPosition.column
        )
      );
    });

    expect(screen.getByText('将转换选中内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '转成 JSON 字符串' }));

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: '复制转换结果' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(window.electronAPI.writeClipboardText).toHaveBeenCalledWith(escapedObject);
    expect(screen.getByText('已复制转换结果')).toBeInTheDocument();
  });

  it('shows a transform error when conversion fails', async () => {
    const onEscapeContent = vi.fn(async () => {
      throw new Error('不是合法 JSON 字符串');
    });

    renderModal('{"name":"first"}', { onEscapeContent });

    fireEvent.click(screen.getByRole('button', { name: '转成 JSON 字符串' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('转换失败：不是合法 JSON 字符串')).toBeInTheDocument();
  });

  it('moves to the nearby next match after deleting the active key/value', async () => {
    const { container } = renderModal(
      [
        '{',
        '  "items": [',
        '    { "name": "first" },',
        '    { "name": "second" },',
        '    { "name": "third" }',
        '  ]',
        '}',
      ].join('\n')
    );

    await searchForName(container);
    fireEvent.click(screen.getByRole('button', { name: '下一个' }));
    expect(screen.getByText('2/3')).toBeInTheDocument();

    const revealCountBeforeDelete = mockEditorState.editor?.revealRangeInCenter.mock.calls.length;
    fireEvent.change(screen.getByLabelText('mock-json-editor'), {
      target: {
        value: ['{', '  "items": [', '    { "name": "first" },', '    { "name": "third" }', '  ]', '}'].join('\n'),
      },
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(mockEditorState.editor?.revealRangeInCenter).toHaveBeenCalledTimes(revealCountBeforeDelete ?? 0);
  });
});
