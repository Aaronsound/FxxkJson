import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

export interface JsonEditSelectionContext {
  editor: monaco.editor.IStandaloneCodeEditor;
  model: monaco.editor.ITextModel;
  selection: monaco.Selection;
  startOffset: number;
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
  runWritableEditorEdit(context.editor, () => {
    context.editor.pushUndoStop();
    context.editor.executeEdits('json-edit-transform-selection', [
      {
        range: context.selection,
        text: nextValue,
        forceMoveMarkers: true,
      },
    ]);
    context.editor.pushUndoStop();
  });

  const startPosition = context.model.getPositionAt(context.startOffset);
  const endPosition = context.model.getPositionAt(context.startOffset + nextValue.length);
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
