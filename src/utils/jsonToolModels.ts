import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  DEFAULT_TAB_TITLE,
  LARGE_FILE_THRESHOLD,
  STRUCTURE_SYNC_THRESHOLD,
  Tab,
} from '../types/jsonTool';

const utf8Encoder = new TextEncoder();

export function createTab(id: string, title = DEFAULT_TAB_TITLE): Tab {
  return { id, title };
}

export function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || 'Untitled';
}

export function getUtf8ByteLength(text: string) {
  return utf8Encoder.encode(text).length;
}

export function isLargeDocument(text: string) {
  return getUtf8ByteLength(text) >= LARGE_FILE_THRESHOLD;
}

export function canUseStructureSync(text: string) {
  const byteLength = getUtf8ByteLength(text);
  return byteLength >= LARGE_FILE_THRESHOLD && byteLength <= STRUCTURE_SYNC_THRESHOLD;
}

export function shouldBuildWorkerStructure(text: string, largeFileLocateEnabled: boolean) {
  const byteLength = getUtf8ByteLength(text);

  if (byteLength === 0) {
    return false;
  }

  if (byteLength < LARGE_FILE_THRESHOLD) {
    return true;
  }

  return byteLength <= STRUCTURE_SYNC_THRESHOLD && largeFileLocateEnabled;
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

  return monaco.editor.createModel('', language, uri);
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

  return monaco.editor.createModel(value, language, uri);
}

export function disposeModel(path: string) {
  monaco.editor.getModel(monaco.Uri.parse(path))?.dispose();
}
