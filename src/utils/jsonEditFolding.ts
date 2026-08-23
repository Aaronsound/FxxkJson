import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

const EDIT_FOLD_CONTROL_VISUAL_DEDUPE_PX = 4;
const EDIT_MODAL_HIDDEN_AREA_SOURCE = { id: 'fxxkjson-edit-modal-folding' };

export type FoldingContribution = {
  foldingModel?: FoldingModel;
  triggerFoldingModelChanged?: () => void;
  getFoldingModel?: () => Promise<FoldingModel | null> | null;
};

type FoldingRegion = {
  endLineNumber: number;
  isCollapsed: boolean;
  regionIndex: number;
  startLineNumber: number;
};

type FoldingRegions = {
  length: number;
  getEndLineNumber: (index: number) => number;
  getStartLineNumber: (index: number) => number;
  isCollapsed: (index: number) => boolean;
  toRegion: (index: number) => FoldingRegion;
};

export type FoldingModel = {
  regions: FoldingRegions;
  onDidChange?: (listener: () => void) => monaco.IDisposable;
  toggleCollapseState: (regions: FoldingRegion[]) => void;
};

export type EditFoldControl = {
  index: number;
  collapsed: boolean;
  endLineNumber: number;
  lineNumber: number;
  top: number;
};

type FoldingTextModel = monaco.editor.ITextModel & {
  __fxxkjsonEditFoldingOverride?: boolean;
  isTooLargeForTokenization?: () => boolean;
};

type HiddenAreaEditor = monaco.editor.IStandaloneCodeEditor & {
  setHiddenAreas: (ranges: monaco.Range[], source?: unknown) => void;
};

export function refreshEditFoldingControls(editor: monaco.editor.IStandaloneCodeEditor) {
  const refresh = () => {
    if (editor.getModel()?.isDisposed()) {
      return;
    }

    editor.layout();
    editor.updateOptions({
      folding: true,
      showFoldingControls: 'always',
      foldingStrategy: 'indentation',
      foldingMaximumRegions: 200000,
      largeFileOptimizations: false,
    });

    const foldingContribution = editor.getContribution('editor.contrib.folding') as FoldingContribution | null;
    foldingContribution?.triggerFoldingModelChanged?.();
    void foldingContribution?.getFoldingModel?.();
  };

  refresh();
  window.requestAnimationFrame(() => {
    refresh();
    window.requestAnimationFrame(refresh);
  });
  window.setTimeout(refresh, 50);
  window.setTimeout(refresh, 250);
  window.setTimeout(refresh, 750);
}

export function enableLargeEditModelFolding(editor: monaco.editor.IStandaloneCodeEditor) {
  const model = editor.getModel() as FoldingTextModel | null;
  if (!model || model.__fxxkjsonEditFoldingOverride) {
    return;
  }

  model.__fxxkjsonEditFoldingOverride = true;
  model.isTooLargeForTokenization = () => false;
  editor.updateOptions({ folding: false });
}

export function prepareLargeEditModel(editorApi: typeof monaco, path: string, initialValue: string) {
  const uri = editorApi.Uri.parse(path);
  let model = editorApi.editor.getModel(uri) as FoldingTextModel | null;

  if (!model) {
    model = editorApi.editor.createModel(initialValue, 'json', uri) as FoldingTextModel;
  }

  model.__fxxkjsonEditFoldingOverride = true;
  model.isTooLargeForTokenization = () => false;
}

export function getNativeFoldingControlCount() {
  const foldingIconCount = document.querySelectorAll(
    '.modal-editor-shell .codicon-folding-expanded, .modal-editor-shell .codicon-folding-collapsed, .modal-editor-shell .codicon-folding-manual-expanded, .modal-editor-shell .codicon-folding-manual-collapsed'
  ).length;
  if (foldingIconCount > 0) {
    return foldingIconCount;
  }

  return Array.from(document.querySelectorAll<HTMLElement>('.modal-editor-shell .margin-view-overlays .cldr')).filter(
    (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
  ).length;
}

export function getEditFoldKey(startLineNumber: number, endLineNumber: number) {
  return `${startLineNumber}:${endLineNumber}`;
}

export function getEditFoldOverlayLeft() {
  const shellRect = document.querySelector('.modal-editor-shell')?.getBoundingClientRect();
  if (!shellRect) {
    return null;
  }

  const lineNumberRight = Array.from(
    document.querySelectorAll<HTMLElement>('.modal-editor-shell .monaco-editor .line-numbers')
  ).reduce((right, lineNumber) => {
    const rect = lineNumber.getBoundingClientRect();
    return rect.width > 0 ? Math.max(right, rect.right) : right;
  }, 0);

  return lineNumberRight > 0 ? Math.ceil(lineNumberRight - shellRect.left + 3) : null;
}

export function isLineInsideCollapsedEditFold(lineNumber: number, ranges: Iterable<monaco.Range>) {
  for (const range of ranges) {
    if (lineNumber >= range.startLineNumber && lineNumber <= range.endLineNumber) {
      return true;
    }
  }

  return false;
}

export function findJsonFoldEndLine(model: monaco.editor.ITextModel, startLineNumber: number) {
  const startLine = model.getLineContent(startLineNumber);
  const startColumn = startLine.search(/\S/);
  const startCharacter = startColumn >= 0 ? startLine[startColumn] : '';
  if (startCharacter !== '{' && startCharacter !== '[') {
    return null;
  }

  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let lineNumber = startLineNumber; lineNumber <= model.getLineCount(); lineNumber += 1) {
    const line = model.getLineContent(lineNumber);
    const columnStart = lineNumber === startLineNumber ? startColumn : 0;

    for (let column = columnStart; column < line.length; column += 1) {
      const character = line[column];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }

      if (character === '{' || character === '[') {
        depth += 1;
      } else if (character === '}' || character === ']') {
        depth -= 1;
        if (depth === 0) {
          return lineNumber > startLineNumber ? lineNumber : null;
        }
      }
    }
  }

  return null;
}

export function chooseEditFoldControl(current: EditFoldControl | undefined, next: EditFoldControl) {
  if (!current) {
    return next;
  }

  if (!current.collapsed && next.collapsed) {
    return next;
  }

  if (current.collapsed === next.collapsed && next.endLineNumber > current.endLineNumber) {
    return next;
  }

  return current;
}

function expandNativeEditFolds(editor: monaco.editor.IStandaloneCodeEditor) {
  const foldingContribution = editor.getContribution('editor.contrib.folding') as FoldingContribution | null;
  const hiddenAreaEditor = editor as HiddenAreaEditor;

  hiddenAreaEditor.setHiddenAreas([], foldingContribution ?? undefined);

  const unfoldCollapsedRegions = (foldingModel: FoldingModel | null | undefined) => {
    if (!foldingModel) {
      return;
    }

    const collapsedRegions: FoldingRegion[] = [];
    for (let index = 0; index < foldingModel.regions.length; index += 1) {
      if (foldingModel.regions.isCollapsed(index)) {
        collapsedRegions.push(foldingModel.regions.toRegion(index));
      }
    }

    if (collapsedRegions.length > 0) {
      foldingModel.toggleCollapseState(collapsedRegions);
    }
  };

  unfoldCollapsedRegions(foldingContribution?.foldingModel);
  const foldingModelPromise = foldingContribution?.getFoldingModel?.() ?? null;
  void foldingModelPromise?.then((foldingModel) => {
    hiddenAreaEditor.setHiddenAreas([], foldingContribution ?? undefined);
    unfoldCollapsedRegions(foldingModel);
  });
}

export function setEditHiddenAreas(editor: monaco.editor.IStandaloneCodeEditor, ranges: monaco.Range[]) {
  expandNativeEditFolds(editor);
  (editor as HiddenAreaEditor).setHiddenAreas(ranges, EDIT_MODAL_HIDDEN_AREA_SOURCE);
}

export function dedupeEditFoldControlsByVisualPosition(controls: EditFoldControl[]) {
  const nextControls: EditFoldControl[] = [];
  const sortedControls = [...controls].sort(
    (left, right) => left.top - right.top || left.lineNumber - right.lineNumber
  );

  for (const control of sortedControls) {
    const existingIndex = nextControls.findIndex(
      (existingControl) => Math.abs(existingControl.top - control.top) < EDIT_FOLD_CONTROL_VISUAL_DEDUPE_PX
    );

    if (existingIndex < 0) {
      nextControls.push(control);
      continue;
    }

    nextControls[existingIndex] = chooseEditFoldControl(nextControls[existingIndex], control);
  }

  return nextControls.sort((left, right) => left.top - right.top || left.lineNumber - right.lineNumber);
}
