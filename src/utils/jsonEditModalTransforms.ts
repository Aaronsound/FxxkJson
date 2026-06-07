import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

export interface JsonEditSelectionContext {
  editor: monaco.editor.IStandaloneCodeEditor;
  model: monaco.editor.ITextModel;
  selection: monaco.Selection;
  startOffset: number;
}

function indentSelectionReplacement(context: JsonEditSelectionContext, nextValue: string) {
  if (!nextValue.includes('\n')) {
    return nextValue;
  }

  const baseIndentLength = Math.max(0, context.selection.startColumn - 1);
  if (baseIndentLength === 0) {
    return nextValue;
  }

  const baseIndent = ' '.repeat(baseIndentLength);
  const lines = nextValue.split('\n');
  return lines.map((line, index) => (index === 0 || line.length === 0 ? line : `${baseIndent}${line}`)).join('\n');
}

export function runWritableEditorEdit(editor: monaco.editor.IStandaloneCodeEditor, edit: () => void) {
  editor.updateOptions({ readOnly: false });
  edit();
}

export function getJsonEditSelectionContext(
  editor: monaco.editor.IStandaloneCodeEditor | null
): JsonEditSelectionContext | null {
  const model = editor?.getModel() ?? null;
  const selection = editor?.getSelection() ?? null;
  const selectionStart = selection && model ? model.getOffsetAt(selection.getStartPosition()) : null;
  const selectionEnd = selection && model ? model.getOffsetAt(selection.getEndPosition()) : null;

  if (
    !editor ||
    !model ||
    !selection ||
    selectionStart === null ||
    selectionEnd === null ||
    selectionStart === selectionEnd
  ) {
    return null;
  }

  return {
    editor,
    model,
    selection,
    startOffset: Math.min(selectionStart, selectionEnd),
  };
}

export function hasJsonEditSelection(editor: monaco.editor.IStandaloneCodeEditor | null) {
  return getJsonEditSelectionContext(editor) !== null;
}

export function replaceJsonEditDocument(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  nextValue: string
): monaco.Position | null {
  const model = editor?.getModel() ?? null;

  if (!editor || !model) {
    return null;
  }

  const currentPosition = editor.getPosition();
  const currentOffset = currentPosition ? model.getOffsetAt(currentPosition) : 0;
  runWritableEditorEdit(editor, () => {
    editor.pushUndoStop();
    editor.executeEdits('json-edit-transform', [
      {
        range: model.getFullModelRange(),
        text: nextValue,
        forceMoveMarkers: true,
      },
    ]);
    editor.pushUndoStop();
  });

  const nextPosition = model.getPositionAt(Math.min(currentOffset, nextValue.length));
  editor.setPosition(nextPosition);
  editor.revealPositionInCenter(nextPosition);
  return nextPosition;
}

export function replaceJsonEditSelection(context: JsonEditSelectionContext, nextValue: string) {
  const replacementText = indentSelectionReplacement(context, nextValue);

  runWritableEditorEdit(context.editor, () => {
    context.editor.pushUndoStop();
    context.editor.executeEdits('json-edit-transform-selection', [
      {
        range: context.selection,
        text: replacementText,
        forceMoveMarkers: true,
      },
    ]);
    context.editor.pushUndoStop();
  });

  const startPosition = context.model.getPositionAt(context.startOffset);
  const endPosition = context.model.getPositionAt(context.startOffset + replacementText.length);
  const nextSelection = new monaco.Selection(
    startPosition.lineNumber,
    startPosition.column,
    endPosition.lineNumber,
    endPosition.column
  );
  context.editor.setSelection(nextSelection);
  context.editor.revealRangeInCenter(nextSelection);
  return nextSelection;
}
