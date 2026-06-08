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

  dispose = vi.fn();

  isDisposed() {
    return false;
  }

  getLineCount() {
    return this.value.split('\n').length;
  }

  getLineContent(lineNumber: number) {
    return this.value.split('\n')[lineNumber - 1] ?? '';
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

  disposeListeners: Array<() => void> = [];

  scrollListeners: Array<() => void> = [];

  position: { lineNumber: number; column: number };

  focus = vi.fn();

  revealRangeInCenter = vi.fn();

  selection: InstanceType<typeof mockEditorState.MockSelection> | null = null;

  setSelection = vi.fn((selection: InstanceType<typeof mockEditorState.MockSelection>) => {
    this.selection = selection;
    this.position = selection.getEndPosition();
    this.cursorSelectionListeners.forEach((listener) => listener());
  });

  setHiddenAreas = vi.fn();

  revealPositionInCenter = vi.fn();

  layout = vi.fn();

  render = vi.fn();

  foldingRegions = {
    length: 2,
    getStartLineNumber: vi.fn((index: number): number => (index === 0 ? 1 : 2)),
    getEndLineNumber: vi.fn((index: number): number => (index === 0 ? 5 : 4)),
    isCollapsed: vi.fn(() => false),
    toRegion: vi.fn((index: number) => ({
      endLineNumber: index === 0 ? 5 : 4,
      isCollapsed: false,
      regionIndex: index,
      startLineNumber: index === 0 ? 1 : 2,
    })),
  };

  foldingModel = {
    regions: this.foldingRegions,
    toggleCollapseState: vi.fn(),
  };

  foldingContribution = {
    triggerFoldingModelChanged: vi.fn(),
    getFoldingModel: vi.fn(() => Promise.resolve(this.foldingModel)),
  };

  getContribution = vi.fn(() => this.foldingContribution);

  foldAction = {
    run: vi.fn(() => Promise.resolve()),
  };

  unfoldAction = {
    run: vi.fn(() => Promise.resolve()),
  };

  getAction = vi.fn((actionId: string) => {
    if (actionId === 'editor.fold') {
      return this.foldAction;
    }
    if (actionId === 'editor.unfold' || actionId === 'editor.unfoldAll') {
      return this.unfoldAction;
    }
    return null;
  });

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

  getVisibleRanges() {
    return [new mockEditorState.MockRange(1, 1, Math.min(20, this.model.getLineCount()), 1)];
  }

  getTopForLineNumber(lineNumber: number) {
    return (lineNumber - 1) * 18;
  }

  getScrollTop() {
    return 0;
  }

  onDidDispose(listener: () => void) {
    this.disposeListeners.push(listener);
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

  onDidScrollChange(listener: () => void) {
    this.scrollListeners.push(listener);
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

function openEditorContextMenu(container: HTMLElement) {
  const editorShell = container.querySelector('.modal-editor-shell');
  if (!(editorShell instanceof HTMLElement)) {
    throw new Error('Edit modal editor shell was not rendered');
  }

  fireEvent.contextMenu(editorShell, { clientX: 120, clientY: 160 });
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

  it('shows edit transforms in the editor context menu', () => {
    const { container } = renderModal('{"name":"first"}');

    expect(screen.queryByRole('button', { name: '转成 JSON 字符串' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '还原转义内容' })).not.toBeInTheDocument();

    openEditorContextMenu(container);

    expect(screen.getByRole('button', { name: '整段转成 JSON 字符串' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '还原整段转义内容' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制 JSON 字符串字面量' })).toBeInTheDocument();
  });

  it('keeps the cursor near its previous offset after escaping the full document', async () => {
    const onEscapeContent = vi.fn(async () => '"escaped document value"');
    const { container } = renderModal('{\n  "name": "first",\n  "age": 18\n}', { onEscapeContent });
    const editor = mockEditorState.editor;

    editor?.setPosition({ lineNumber: 2, column: 5 });
    const previousOffset = editor?.model.getOffsetAt({ lineNumber: 2, column: 5 });

    openEditorContextMenu(container);
    fireEvent.click(screen.getByRole('button', { name: '整段转成 JSON 字符串' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onEscapeContent).toHaveBeenCalled();
    expect(editor?.getPosition()).toEqual(editor?.model.getPositionAt(previousOffset ?? 0));
    expect(editor?.getPosition()).not.toEqual(editor?.model.getPositionAt(editor.model.getValue().length));
    expect(editor?.revealPositionInCenter).toHaveBeenCalledWith(editor?.getPosition());
  });

  it('writes transformed content even if Monaco is still read-only after a busy transform', async () => {
    const onEscapeContent = vi.fn(async () => '"escaped document value"');
    const onValueChange = vi.fn();

    const { container } = renderModal('{"name":"first"}', { onEscapeContent, onValueChange });
    const editor = mockEditorState.editor;

    editor?.updateOptions({ readOnly: true });

    openEditorContextMenu(container);
    fireEvent.click(screen.getByRole('button', { name: '整段转成 JSON 字符串' }));

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

    const { container } = renderModal(initialValue, { onEscapeContent, onValueChange });
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

    openEditorContextMenu(container);
    fireEvent.click(screen.getByRole('button', { name: '选中内容转成 JSON 字符串' }));

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
  });

  it('keeps restored multiline selection indented for array folding', async () => {
    const initialValue = ['[', '  "{\\"name\\":\\"second\\",\\"nested\\":{\\"ok\\":true}}"', ']'].join('\n');
    const selectedString = '"{\\"name\\":\\"second\\",\\"nested\\":{\\"ok\\":true}}"';
    const restoredObject = ['{', '  "name": "second",', '  "nested": {', '    "ok": true', '  }', '}'].join('\n');
    const onUnescapeContent = vi.fn(async () => restoredObject);
    const onValueChange = vi.fn();

    const { container } = renderModal(initialValue, { onUnescapeContent, onValueChange });
    const editor = mockEditorState.editor;
    if (!editor) {
      throw new Error('Editor was not mounted');
    }

    const selectionStart = initialValue.indexOf(selectedString);
    const startPosition = editor.model.getPositionAt(selectionStart);
    const endPosition = editor.model.getPositionAt(selectionStart + selectedString.length);
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

    openEditorContextMenu(container);
    fireEvent.click(screen.getByRole('button', { name: '还原选中转义内容' }));

    await act(async () => {
      await Promise.resolve();
    });

    const expectedValue = [
      '[',
      '  {',
      '    "name": "second",',
      '    "nested": {',
      '      "ok": true',
      '    }',
      '  }',
      ']',
    ].join('\n');

    expect(editor.getValue()).toBe(expectedValue);
    expect(onValueChange).toHaveBeenCalledWith(expectedValue);
  });

  it('refreshes edit folding controls after mount and content changes', async () => {
    const { container } = renderModal(['[', '  {', '    "name": "first"', '  }', ']'].join('\n'));
    const editor = mockEditorState.editor;
    if (!editor) {
      throw new Error('Editor was not mounted');
    }

    expect(editor.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        folding: true,
        showFoldingControls: 'always',
        foldingStrategy: 'indentation',
        foldingMaximumRegions: 200000,
        largeFileOptimizations: false,
      })
    );
    expect(editor.layout).toHaveBeenCalled();
    expect(editor.foldingContribution.triggerFoldingModelChanged).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('mock-json-editor'), {
      target: { value: ['[', '  {', '    "name": "second"', '  }', ']'].join('\n') },
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(container.querySelectorAll('.edit-modal-fold-button')).toHaveLength(2);
    fireEvent.click(container.querySelector('.edit-modal-fold-button') as HTMLButtonElement);
    expect(editor.setHiddenAreas).toHaveBeenCalledWith([
      expect.objectContaining({
        startLineNumber: 2,
        endLineNumber: 5,
      }),
    ]);
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(container.querySelectorAll('.edit-modal-fold-button')).toHaveLength(1);
    expect(container.querySelector('.edit-modal-fold-button.collapsed')).toBeTruthy();
    fireEvent.click(container.querySelector('.edit-modal-fold-button.collapsed') as HTMLButtonElement);
    expect(editor.setHiddenAreas).toHaveBeenLastCalledWith([]);
    expect(editor.foldingModel.toggleCollapseState).not.toHaveBeenCalled();
    expect(editor.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        folding: true,
        showFoldingControls: 'always',
      })
    );
    expect(container.querySelector('.modal-editor-shell')).toBeTruthy();
  });

  it('keeps clickable fallback fold buttons when Monaco renders native fold controls', async () => {
    const { container } = renderModal(['[', '  {', '    "name": "first"', '  }', ']'].join('\n'));
    const editor = mockEditorState.editor;
    const editorShell = container.querySelector('.modal-editor-shell');
    if (!editor || !(editorShell instanceof HTMLElement)) {
      throw new Error('Edit modal editor shell was not rendered');
    }

    const nativeFoldIcon = document.createElement('span');
    nativeFoldIcon.className = 'codicon-folding-expanded';
    editorShell.appendChild(nativeFoldIcon);

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(container.querySelectorAll('.codicon-folding-expanded')).toHaveLength(1);
    expect(container.querySelectorAll('.edit-modal-fold-button')).toHaveLength(2);
    fireEvent.click(container.querySelector('.edit-modal-fold-button') as HTMLButtonElement);
    expect(editor.setHiddenAreas).toHaveBeenCalledWith([
      expect.objectContaining({
        startLineNumber: 2,
        endLineNumber: 5,
      }),
    ]);
  });

  it('deduplicates repeated fallback fold buttons on the same line', async () => {
    const { container } = renderModal(['[', '  {', '    "name": "first"', '  }', ']'].join('\n'));
    const editor = mockEditorState.editor;
    if (!editor) {
      throw new Error('Editor was not mounted');
    }

    editor.foldingRegions.length = 3;
    editor.foldingRegions.getStartLineNumber.mockImplementation((index: number) => (index === 0 ? 1 : 2));
    editor.foldingRegions.getEndLineNumber.mockImplementation((index: number) =>
      index === 0 ? 5 : index === 1 ? 3 : 4
    );

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(container.querySelectorAll('.edit-modal-fold-button')).toHaveLength(2);
    fireEvent.click(container.querySelectorAll('.edit-modal-fold-button')[1] as HTMLButtonElement);
    expect(editor.setHiddenAreas).toHaveBeenCalledWith([
      expect.objectContaining({
        startLineNumber: 3,
        endLineNumber: 4,
      }),
    ]);
  });

  it('deduplicates repeated fallback fold buttons at the same visual position', async () => {
    const { container } = renderModal(['[', '  {', '    "name": "first"', '  }', ']'].join('\n'));
    const editor = mockEditorState.editor;
    if (!editor) {
      throw new Error('Editor was not mounted');
    }

    editor.foldingRegions.length = 3;
    editor.foldingRegions.getStartLineNumber.mockImplementation((index: number) => index + 1);
    editor.foldingRegions.getEndLineNumber.mockImplementation((index: number) => (index === 0 ? 5 : index + 3));
    editor.getTopForLineNumber = vi.fn((lineNumber: number) => (lineNumber <= 1 ? 0 : 2));

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(container.querySelectorAll('.edit-modal-fold-button')).toHaveLength(1);
  });

  it('disposes the edit model when the modal editor is disposed', () => {
    renderModal('{"name":"first"}');
    const editor = mockEditorState.editor;

    editor?.disposeListeners.forEach((listener) => listener());

    expect(editor?.model.dispose).toHaveBeenCalled();
  });

  it('copies the selected edit text from the context menu', async () => {
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      onFindShortcut: vi.fn(),
      openJsonFile: vi.fn(),
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText: vi.fn(),
    };

    const { container } = renderModal('{"items":[{"name":"first"},{"name":"second"}]}');
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

    openEditorContextMenu(container);

    expect(screen.getByRole('button', { name: '选中内容转成 JSON 字符串' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '还原选中转义内容' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '复制' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(window.electronAPI.writeClipboardText).toHaveBeenCalledWith(selectedObject);
  });

  it('shows a transform error when conversion fails', async () => {
    const onEscapeContent = vi.fn(async () => {
      throw new Error('不是合法 JSON 字符串');
    });

    const { container } = renderModal('{"name":"first"}', { onEscapeContent });

    openEditorContextMenu(container);
    fireEvent.click(screen.getByRole('button', { name: '整段转成 JSON 字符串' }));

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
