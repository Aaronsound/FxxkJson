import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

type MonacoApi = typeof Monaco;

interface RegisterFindActionArgs {
  actionId: string;
  focusContextKey: string;
  label: string;
  onOpen: () => void;
}

interface RegisterSelectAllDeleteArgs {
  focusContextKey: string;
  onClearAll: () => void;
  selectionCoversModel: () => boolean;
}

export function bindEditorFocusContext(
  editor: Monaco.editor.IStandaloneCodeEditor,
  focusContextKey: string
) {
  const focusContext = editor.createContextKey(focusContextKey, editor.hasTextFocus());

  editor.onDidFocusEditorText(() => {
    focusContext.set(true);
  });

  editor.onDidBlurEditorText(() => {
    focusContext.set(false);
  });
}

export function getContentAfterSelectionReplace(
  model: Monaco.editor.ITextModel,
  selection: Monaco.Selection,
  text: string
) {
  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const endOffset = model.getOffsetAt(selection.getEndPosition());
  const currentText = model.getValue();

  return `${currentText.slice(0, startOffset)}${text}${currentText.slice(endOffset)}`;
}

export function registerPaneFindAction(
  monacoApi: MonacoApi,
  editor: Monaco.editor.IStandaloneCodeEditor,
  {
    actionId,
    focusContextKey,
    label,
    onOpen,
  }: RegisterFindActionArgs
) {
  editor.addAction({
    id: actionId,
    label,
    keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyF],
    precondition: focusContextKey,
    keybindingContext: focusContextKey,
    run: () => {
      onOpen();
    },
  });
}

export function registerSelectAllDeleteCommands(
  monacoApi: MonacoApi,
  editor: Monaco.editor.IStandaloneCodeEditor,
  {
    focusContextKey,
    onClearAll,
    selectionCoversModel,
  }: RegisterSelectAllDeleteArgs
) {
  editor.addCommand(monacoApi.KeyCode.Delete, () => {
    if (selectionCoversModel()) {
      onClearAll();
      return;
    }

    editor.trigger('', 'deleteRight', null);
  }, focusContextKey);

  editor.addCommand(monacoApi.KeyCode.Backspace, () => {
    if (selectionCoversModel()) {
      onClearAll();
      return;
    }

    editor.trigger('', 'deleteLeft', null);
  }, focusContextKey);
}
