import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  class MockSelection extends MockRange {}

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
}

class MockEditor {
  model: MockTextModel;

  commands = new Map<number, () => void>();

  contentListeners: Array<() => void> = [];

  focus = vi.fn();

  revealRangeInCenter = vi.fn();

  setSelection = vi.fn();

  setPosition = vi.fn();

  revealPositionInCenter = vi.fn();

  pushUndoStop = vi.fn();

  constructor(value: string) {
    this.model = new MockTextModel(value);
  }

  getModel() {
    return this.model;
  }

  getPosition() {
    return this.model.getPositionAt(this.model.getValue().length);
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

  addCommand(keybinding: number, callback: () => void) {
    this.commands.set(keybinding, callback);
  }

  deltaDecorations(_: string[], decorations: unknown[]) {
    return decorations.map((__, index) => `decoration-${index}`);
  }

  executeEdits(_: string, edits: Array<{ range: unknown; text: string }>) {
    this.model.setValue(edits[0]?.text ?? '');
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

function renderModal(initialValue: string) {
  return render(<JsonEditModal {...baseProps} initialValue={initialValue} />);
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
