import { MutableRefObject, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { RightNodeSelection } from '../types/jsonTool';

interface UseRightNodeSelectionHighlightArgs {
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  isDisabled: boolean;
  selection: RightNodeSelection | null;
}

export function useRightNodeSelectionHighlight({
  editorRef,
  isDisabled,
  selection,
}: UseRightNodeSelectionHighlightArgs) {
  const decorationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();

    const clearSelectionHighlight = () => {
      if (editor && decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
      }
    };

    if (!editor || !model || !selection || isDisabled) {
      clearSelectionHighlight();
      return;
    }

    const modelLength = model.getValueLength();
    const startOffset = Math.max(0, Math.min(selection.startOffset, modelLength));
    const endOffset = Math.max(startOffset, Math.min(selection.endOffset, modelLength));
    const startPosition = model.getPositionAt(startOffset);
    const endPosition = model.getPositionAt(endOffset);

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [
      {
        range: new monaco.Range(
          startPosition.lineNumber,
          startPosition.column,
          endPosition.lineNumber,
          endPosition.column
        ),
        options: {
          inlineClassName: 'rightNodeSelectionHighlight',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);
  }, [editorRef, isDisabled, selection]);

  useEffect(
    () => () => {
      const editor = editorRef.current;
      if (editor && decorationIdsRef.current.length > 0) {
        editor.deltaDecorations(decorationIdsRef.current, []);
        decorationIdsRef.current = [];
      }
    },
    [editorRef]
  );
}
