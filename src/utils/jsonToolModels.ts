import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  DEFAULT_TAB_TITLE,
  LARGE_FILE_THRESHOLD,
  Tab,
} from '../types/jsonTool';
export {
  canUseStructureSync,
  getUtf8ByteLength,
  isLargeDocument,
  shouldBuildWorkerStructure,
  shouldUseLargeMode,
} from './jsonDocumentMetrics';

export function createTab(id: string, title = DEFAULT_TAB_TITLE): Tab {
  return { id, title };
}

export function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || 'Untitled';
}

export function selectionCoversModel(editor: monaco.editor.IStandaloneCodeEditor) {
  const model = editor.getModel();
  const selection = editor.getSelection();

  return !!model && !!selection && selection.equalsRange(model.getFullModelRange());
}

export function getLeftModelPath(tabId: string) {
  return `inmemory://hanjson/raw/${tabId}.json`;
}

export function getRightModelPath(tabId: string) {
  return `inmemory://hanjson/formatted/${tabId}.json`;
}

export function getEditorLanguageByLength(textByteLength: number) {
  return textByteLength >= LARGE_FILE_THRESHOLD ? 'plaintext' : 'json';
}

export function getOrCreateModel(path: string, language: string) {
  const uri = monaco.Uri.parse(path);
  const existingModel = monaco.editor.getModel(uri);

  if (existingModel) {
    if (existingModel.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(existingModel, language);
    }

    return existingModel;
  }

  const model = monaco.editor.createModel('', language, uri);
  if (model.getLanguageId() !== language) {
    monaco.editor.setModelLanguage(model, language);
  }
  return model;
}

export function recreateModel(
  path: string,
  language: string,
  value: string,
  editor: monaco.editor.IStandaloneCodeEditor | null
) {
  const uri = monaco.Uri.parse(path);
  const existingModel = monaco.editor.getModel(uri);

  if (existingModel) {
    if (editor?.getModel() === existingModel) {
      editor.setModel(null);
    }

    existingModel.dispose();
  }

  const model = monaco.editor.createModel(value, language, uri);
  if (model.getLanguageId() !== language) {
    monaco.editor.setModelLanguage(model, language);
  }
  return model;
}

export function disposeModel(path: string) {
  monaco.editor.getModel(monaco.Uri.parse(path))?.dispose();
}
