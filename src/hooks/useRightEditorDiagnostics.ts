import type { MutableRefObject } from 'react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { StructureStatus } from '../types/jsonTool';
import { STRUCTURE_SYNC_THRESHOLD } from '../types/jsonTool';
import { logDiagnosticsToConsole } from '../utils/diagnosticsLogger';
import { getUtf8ByteLength } from '../utils/jsonDocumentMetrics';

interface UseRightEditorDiagnosticsArgs {
  activeTabIdRef: MutableRefObject<string>;
  formattedTextByTabRef: MutableRefObject<Record<string, string>>;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  logEvent: (event: string, details?: Record<string, unknown>) => void;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  rightDecorationIdsRef: MutableRefObject<string[]>;
  rightEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  structureStatusRef: MutableRefObject<Record<string, StructureStatus>>;
}

export function useRightEditorDiagnostics({
  activeTabIdRef,
  formattedTextByTabRef,
  largeFileLocateEnabledRef,
  largeModeRef,
  logEvent,
  rawTextByTabRef,
  rightDecorationIdsRef,
  rightEditorRef,
  structureStatusRef,
}: UseRightEditorDiagnosticsArgs) {
  const clearRightHighlights = () => {
    if (rightEditorRef.current && rightDecorationIdsRef.current.length > 0) {
      rightEditorRef.current.deltaDecorations(rightDecorationIdsRef.current, []);
      rightDecorationIdsRef.current = [];
    }
  };

  const logRightEditorState = (event: string, tabId: string, extra: Record<string, unknown> = {}) => {
    const editor = rightEditorRef.current;
    const model = editor?.getModel();
    const rawText = rawTextByTabRef.current[tabId] ?? '';
    const formattedText = formattedTextByTabRef.current[tabId] ?? '';
    const payload = {
      tabId,
      rawBytes: getUtf8ByteLength(rawText),
      formattedBytes: getUtf8ByteLength(formattedText),
      isActiveTab: activeTabIdRef.current === tabId,
      modelLanguageId: model?.getLanguageId() ?? null,
      modelLineCount: model?.getLineCount() ?? 0,
      modelValueLength: model?.getValueLength() ?? 0,
      largeMode: Boolean(largeModeRef.current[tabId]),
      locateEnabled: Boolean(largeFileLocateEnabledRef.current[tabId]),
      structureStatus: structureStatusRef.current[tabId] ?? null,
      withinStructureThreshold: getUtf8ByteLength(rawText) <= STRUCTURE_SYNC_THRESHOLD,
      ...extra,
    };

    logDiagnosticsToConsole(event, payload);
    logEvent(event, payload);
  };

  return {
    clearRightHighlights,
    logRightEditorState,
  };
}
