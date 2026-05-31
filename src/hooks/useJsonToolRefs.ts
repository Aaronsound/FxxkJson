import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { LargeJsonReadonlyViewerHandle } from '../components/LargeJsonReadonlyViewer';
import type { LargeRawReadonlyViewerHandle } from '../components/LargeRawReadonlyViewer';
import type { StructureStatus } from '../types/jsonTool';

export function useJsonToolRefs(initialTabId: string) {
  const leftEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const rightEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const largeRawViewerRef = useRef<LargeRawReadonlyViewerHandle | null>(null);
  const largeViewerRef = useRef<LargeJsonReadonlyViewerHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rawTextByTabRef = useRef<Record<string, string>>({
    [initialTabId]: '',
  });
  const formattedTextByTabRef = useRef<Record<string, string>>({
    [initialTabId]: '',
  });
  const leftSearchWorkerRevisionRef = useRef<Record<string, number>>({});
  const suppressLeftChangeRef = useRef<Record<string, boolean>>({});
  const activeTabIdRef = useRef(initialTabId);
  const largeModeRef = useRef<Record<string, boolean>>({
    [initialTabId]: false,
  });
  const largeFileLocateEnabledRef = useRef<Record<string, boolean>>({
    [initialTabId]: false,
  });
  const structureStatusRef = useRef<Record<string, StructureStatus>>({
    [initialTabId]: 'ready',
  });
  const workerStructureEnabledRef = useRef<Record<string, boolean>>({
    [initialTabId]: false,
  });
  const rightDecorationIdsRef = useRef<string[]>([]);
  const rightContextMenuOffsetByTabRef = useRef<Record<string, number | null>>({});
  const leftViewStateByTabRef = useRef<Record<string, monaco.editor.ICodeEditorViewState | null>>({});
  const rightViewStateByTabRef = useRef<Record<string, monaco.editor.ICodeEditorViewState | null>>({});
  const previousActiveTabIdRef = useRef(initialTabId);

  return {
    activeTabIdRef,
    fileInputRef,
    formattedTextByTabRef,
    largeFileLocateEnabledRef,
    largeModeRef,
    largeRawViewerRef,
    largeViewerRef,
    leftEditorRef,
    leftSearchWorkerRevisionRef,
    leftViewStateByTabRef,
    previousActiveTabIdRef,
    rawTextByTabRef,
    rightContextMenuOffsetByTabRef,
    rightDecorationIdsRef,
    rightEditorRef,
    rightViewStateByTabRef,
    structureStatusRef,
    suppressLeftChangeRef,
    workerStructureEnabledRef,
  };
}

type PreserveActiveTabViewStateOptions = Pick<
  ReturnType<typeof useJsonToolRefs>,
  'leftEditorRef' | 'leftViewStateByTabRef' | 'previousActiveTabIdRef' | 'rightEditorRef' | 'rightViewStateByTabRef'
> & {
  activeTabId: string;
};

export function usePreserveActiveTabViewState({
  activeTabId,
  leftEditorRef,
  leftViewStateByTabRef,
  previousActiveTabIdRef,
  rightEditorRef,
  rightViewStateByTabRef,
}: PreserveActiveTabViewStateOptions) {
  useEffect(() => {
    const previousTabId = previousActiveTabIdRef.current;

    if (previousTabId && previousTabId !== activeTabId) {
      leftViewStateByTabRef.current[previousTabId] = leftEditorRef.current?.saveViewState() ?? null;
      rightViewStateByTabRef.current[previousTabId] = rightEditorRef.current?.saveViewState() ?? null;
    }

    previousActiveTabIdRef.current = activeTabId;
  }, [
    activeTabId,
    leftEditorRef,
    leftViewStateByTabRef,
    previousActiveTabIdRef,
    rightEditorRef,
    rightViewStateByTabRef,
  ]);
}
