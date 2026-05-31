import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { LARGE_FILE_THRESHOLD, STRUCTURE_SYNC_THRESHOLD } from '../types/jsonTool';
import {
  disposeModel,
  getEditorLanguageByLength,
  getLeftModelPath,
  getOrCreateModel,
  getRightModelPath,
  recreateModel,
} from '../utils/jsonToolModels';
import { getUtf8ByteLength, isLargeDocument } from '../utils/jsonDocumentMetrics';
import { getMonacoOptions } from '../utils/jsonEditorInteractions';

interface UseJsonEditorModelSyncArgs {
  largeModeRef: MutableRefObject<Record<string, boolean>>;
  largeViewerDataByTab: Record<string, unknown>;
  largeViewerStatusByTab: Record<string, 'idle' | 'building' | 'ready'>;
  activeTabIdRef: MutableRefObject<string>;
  leftEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  leftViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
  logRightEditorState: (event: string, tabId: string, extra?: Record<string, unknown>) => void;
  rawTextByTabRef: MutableRefObject<Record<string, string>>;
  rightEditorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  rightViewStateByTabRef: MutableRefObject<Record<string, monaco.editor.ICodeEditorViewState | null>>;
  suppressLeftChangeRef: MutableRefObject<Record<string, boolean>>;
  wrapLongLines: boolean;
}

export function useJsonEditorModelSync({
  activeTabIdRef,
  largeModeRef,
  largeViewerDataByTab,
  largeViewerStatusByTab,
  leftEditorRef,
  leftViewStateByTabRef,
  logEvent,
  logRightEditorState,
  rawTextByTabRef,
  rightEditorRef,
  rightViewStateByTabRef,
  suppressLeftChangeRef,
  wrapLongLines,
}: UseJsonEditorModelSyncArgs) {
  const attachEditorModel = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor | null,
      model: monaco.editor.ITextModel,
      viewState: monaco.editor.ICodeEditorViewState | null | undefined,
      event: string,
      details: Record<string, unknown>
    ) => {
      if (!editor) {
        return;
      }

      const shouldSwitchModel = editor.getModel() !== model;

      if (shouldSwitchModel) {
        editor.setModel(model);
        logEvent(event, details);

        if (viewState) {
          editor.restoreViewState(viewState);
        }
      }

      editor.layout();
    },
    [logEvent]
  );

  const syncLeftModel = useCallback(
    (tabId: string, content: string, forceValue = false) => {
      const path = getLeftModelPath(tabId);
      const byteLength = getUtf8ByteLength(content);

      if (byteLength >= LARGE_FILE_THRESHOLD) {
        if (activeTabIdRef.current === tabId) {
          leftViewStateByTabRef.current[tabId] =
            leftEditorRef.current?.saveViewState() ?? leftViewStateByTabRef.current[tabId] ?? null;
          leftEditorRef.current?.setModel(null);
        }
        disposeModel(path);
        logEvent('left-model-dedicated-viewer', {
          tabId,
          rawLength: byteLength,
        });
        return;
      }

      const language = getEditorLanguageByLength(byteLength);
      let model = getOrCreateModel(path, language);

      if (forceValue || model.getValueLength() !== content.length || model.getLanguageId() !== language) {
        if (activeTabIdRef.current === tabId) {
          leftViewStateByTabRef.current[tabId] =
            leftEditorRef.current?.saveViewState() ?? leftViewStateByTabRef.current[tabId] ?? null;
        }
        suppressLeftChangeRef.current[tabId] = true;
        model = recreateModel(path, language, content, activeTabIdRef.current === tabId ? leftEditorRef.current : null);
        suppressLeftChangeRef.current[tabId] = false;
        logEvent(forceValue ? 'left-model-value-written' : 'left-model-value-synced', {
          tabId,
          rawLength: byteLength,
        });
      }

      if (activeTabIdRef.current === tabId) {
        attachEditorModel(leftEditorRef.current, model, leftViewStateByTabRef.current[tabId], 'left-model-attached', {
          tabId,
          path,
          rawLength: byteLength,
        });
      }
    },
    [activeTabIdRef, attachEditorModel, leftEditorRef, leftViewStateByTabRef, logEvent, suppressLeftChangeRef]
  );

  const syncRightModel = useCallback(
    (tabId: string, content: string, forceValue = false) => {
      const path = getRightModelPath(tabId);
      const byteLength = getUtf8ByteLength(content);
      const rawText = rawTextByTabRef.current[tabId] ?? '';
      const rawByteLength = getUtf8ByteLength(rawText);
      const shouldPreferDedicatedViewer =
        Boolean(largeViewerDataByTab[tabId]) || largeViewerStatusByTab[tabId] === 'building';

      if (shouldPreferDedicatedViewer) {
        const existingModel = monaco.editor.getModel(monaco.Uri.parse(path));
        if (existingModel) {
          if (rightEditorRef.current?.getModel() === existingModel) {
            rightEditorRef.current.setModel(null);
          }
          existingModel.dispose();
        }
        return;
      }

      const enableStructuralFolding = rawByteLength <= STRUCTURE_SYNC_THRESHOLD;
      const effectiveLargeMode = largeModeRef.current[tabId] || isLargeDocument(rawText);
      const language =
        rawByteLength > 0 && rawByteLength <= STRUCTURE_SYNC_THRESHOLD ? 'json' : getEditorLanguageByLength(byteLength);
      let model = getOrCreateModel(path, language);

      if (forceValue || model.getValueLength() !== content.length || model.getLanguageId() !== language) {
        if (activeTabIdRef.current === tabId) {
          rightViewStateByTabRef.current[tabId] =
            rightEditorRef.current?.saveViewState() ?? rightViewStateByTabRef.current[tabId] ?? null;
        }
        model = recreateModel(
          path,
          language,
          content,
          activeTabIdRef.current === tabId ? rightEditorRef.current : null
        );
        logEvent(forceValue ? 'right-model-value-written' : 'right-model-value-synced', {
          tabId,
          formattedLength: byteLength,
        });
      }

      if (activeTabIdRef.current === tabId) {
        attachEditorModel(
          rightEditorRef.current,
          model,
          rightViewStateByTabRef.current[tabId],
          'right-model-attached',
          {
            tabId,
            path,
            formattedLength: byteLength,
            language,
            largeMode: effectiveLargeMode,
            enableStructuralFolding,
          }
        );
        rightEditorRef.current?.updateOptions(
          getMonacoOptions({
            largeMode: effectiveLargeMode,
            wrapLongLines,
            readOnly: true,
            enableStructuralFolding,
          })
        );
        rightEditorRef.current?.layout();
        logRightEditorState('right-editor-state', tabId, {
          context: forceValue ? 'sync-force' : 'sync',
          language,
          enableStructuralFolding,
          effectiveLargeMode,
        });
      }
    },
    [
      activeTabIdRef,
      attachEditorModel,
      largeModeRef,
      largeViewerDataByTab,
      largeViewerStatusByTab,
      logEvent,
      logRightEditorState,
      rawTextByTabRef,
      rightEditorRef,
      rightViewStateByTabRef,
      wrapLongLines,
    ]
  );

  return {
    attachEditorModel,
    syncLeftModel,
    syncRightModel,
  };
}
