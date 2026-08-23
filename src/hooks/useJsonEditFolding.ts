import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  chooseEditFoldControl,
  dedupeEditFoldControlsByVisualPosition,
  type EditFoldControl,
  findJsonFoldEndLine,
  type FoldingContribution,
  getEditFoldKey,
  getEditFoldOverlayLeft,
  isLineInsideCollapsedEditFold,
  refreshEditFoldingControls,
  setEditHiddenAreas,
} from '../utils/jsonEditFolding';

export function useJsonEditFolding(editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>) {
  const [foldControls, setFoldControls] = useState<EditFoldControl[]>([]);
  const [foldOverlayLeft, setFoldOverlayLeft] = useState<number | null>(null);
  const collapsedFoldRangesRef = useRef<Map<string, monaco.Range>>(new Map());

  const updateFoldControls = useCallback(async () => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || model.isDisposed()) {
      setFoldControls([]);
      return;
    }

    const foldingContribution = editor.getContribution('editor.contrib.folding') as FoldingContribution | null;
    const foldingModel = (await foldingContribution?.getFoldingModel?.()) ?? foldingContribution?.foldingModel ?? null;
    if (editorRef.current !== editor || !foldingModel) {
      return;
    }

    const visibleRanges = editor.getVisibleRanges();
    const firstVisibleLine = Math.max(1, (visibleRanges[0]?.startLineNumber ?? 1) - 2);
    const lastVisibleLine = Math.min(model.getLineCount(), (visibleRanges.at(-1)?.endLineNumber ?? 1) + 2);
    const regions = foldingModel.regions;
    const controlsByLine = new Map<number, EditFoldControl>();
    const nextOverlayLeft = getEditFoldOverlayLeft();
    const collapsedFoldRanges = Array.from(collapsedFoldRangesRef.current.values());

    for (let index = 0; index < regions.length && controlsByLine.size < 200; index += 1) {
      const lineNumber = regions.getStartLineNumber(index);
      if (lineNumber < firstVisibleLine) {
        continue;
      }
      if (lineNumber > lastVisibleLine) {
        break;
      }

      const endLineNumber = regions.getEndLineNumber(index);
      const isCollapsed = collapsedFoldRangesRef.current.has(getEditFoldKey(lineNumber, endLineNumber));
      if (!isCollapsed && isLineInsideCollapsedEditFold(lineNumber, collapsedFoldRanges)) {
        continue;
      }

      const nextControl = {
        index,
        collapsed: isCollapsed,
        endLineNumber,
        lineNumber,
        top: editor.getTopForLineNumber(lineNumber) - editor.getScrollTop(),
      };
      controlsByLine.set(lineNumber, chooseEditFoldControl(controlsByLine.get(lineNumber), nextControl));
    }

    for (
      let lineNumber = firstVisibleLine;
      lineNumber <= lastVisibleLine && controlsByLine.size < 200;
      lineNumber += 1
    ) {
      if (lineNumber === 1 || controlsByLine.has(lineNumber)) {
        continue;
      }

      const endLineNumber = findJsonFoldEndLine(model, lineNumber);
      if (!endLineNumber) {
        continue;
      }

      const isCollapsed = collapsedFoldRangesRef.current.has(getEditFoldKey(lineNumber, endLineNumber));
      if (!isCollapsed && isLineInsideCollapsedEditFold(lineNumber, collapsedFoldRanges)) {
        continue;
      }

      controlsByLine.set(lineNumber, {
        collapsed: isCollapsed,
        endLineNumber,
        index: -lineNumber,
        lineNumber,
        top: editor.getTopForLineNumber(lineNumber) - editor.getScrollTop(),
      });
    }

    setFoldOverlayLeft(nextOverlayLeft);
    setFoldControls(dedupeEditFoldControlsByVisualPosition(Array.from(controlsByLine.values())));
  }, [editorRef]);

  const scheduleFoldControlsUpdate = useCallback(() => {
    window.requestAnimationFrame(() => {
      void updateFoldControls();
    });
    window.setTimeout(() => {
      void updateFoldControls();
    }, 50);
    window.setTimeout(() => {
      void updateFoldControls();
    }, 250);
    window.setTimeout(() => {
      void updateFoldControls();
    }, 750);
  }, [updateFoldControls]);

  const resetEditFoldControls = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor | null) => {
      collapsedFoldRangesRef.current.clear();

      if (!editor) {
        setFoldControls([]);
        return;
      }

      void editor.getAction('editor.unfoldAll')?.run();
      setEditHiddenAreas(editor, []);
      editor.render(true);
      editor.layout();
      refreshEditFoldingControls(editor);
      void updateFoldControls();
      scheduleFoldControlsUpdate();
    },
    [scheduleFoldControlsUpdate, updateFoldControls]
  );

  const handleToggleFoldControl = useCallback(
    (control: EditFoldControl) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model || control.endLineNumber <= control.lineNumber) {
        return;
      }

      const foldKey = getEditFoldKey(control.lineNumber, control.endLineNumber);
      if (collapsedFoldRangesRef.current.has(foldKey)) {
        collapsedFoldRangesRef.current.delete(foldKey);
      } else {
        collapsedFoldRangesRef.current.set(
          foldKey,
          new monaco.Range(
            control.lineNumber + 1,
            1,
            control.endLineNumber,
            model.getLineMaxColumn(control.endLineNumber)
          )
        );
        const selection = editor.getSelection();
        if (
          selection &&
          selection.startLineNumber > control.lineNumber &&
          selection.startLineNumber <= control.endLineNumber
        ) {
          editor.setPosition({ lineNumber: control.lineNumber, column: model.getLineMaxColumn(control.lineNumber) });
        }
      }

      setEditHiddenAreas(editor, Array.from(collapsedFoldRangesRef.current.values()));
      editor.render(true);
      editor.layout();
      scheduleFoldControlsUpdate();
    },
    [editorRef, scheduleFoldControlsUpdate]
  );

  const clearEditFoldControls = useCallback(() => {
    collapsedFoldRangesRef.current.clear();
    setFoldControls([]);
  }, []);

  return {
    clearEditFoldControls,
    foldControls,
    foldOverlayLeft,
    handleToggleFoldControl,
    resetEditFoldControls,
    scheduleFoldControlsUpdate,
  };
}
