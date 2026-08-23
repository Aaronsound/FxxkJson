import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';

const monacoState = vi.hoisted(() => {
  const models = new Map<string, ReturnType<typeof createModel>>();

  function createModel(value = '', language = 'json', uri = { value: 'model' }) {
    let currentLanguage = language;
    return {
      dispose: vi.fn(() => models.delete(uri.value)),
      getFullModelRange: vi.fn(() => ({ endColumn: 2, endLineNumber: 1, startColumn: 1, startLineNumber: 1 })),
      getLanguageId: vi.fn(() => currentLanguage),
      setLanguage(nextLanguage: string) {
        currentLanguage = nextLanguage;
      },
      uri,
      value,
    };
  }

  return { createModel, models };
});

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  Uri: {
    parse: (value: string) => ({ value }),
  },
  editor: {
    createModel: vi.fn((value: string, language: string, uri: { value: string }) => {
      const model = monacoState.createModel(value, language, uri);
      monacoState.models.set(uri.value, model);
      return model;
    }),
    getModel: vi.fn((uri: { value: string }) => monacoState.models.get(uri.value) ?? null),
    setModelLanguage: vi.fn((model: ReturnType<typeof monacoState.createModel>, language: string) => {
      model.setLanguage(language);
    }),
  },
}));

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  createTab,
  disposeModel,
  getEditorLanguageByLength,
  getFileName,
  getLeftModelPath,
  getOrCreateModel,
  getRightModelPath,
  recreateModel,
  selectionCoversModel,
} from './jsonToolModels';

describe('jsonToolModels Monaco lifecycle', () => {
  beforeEach(() => {
    monacoState.models.clear();
    vi.clearAllMocks();
  });

  it('creates tab labels, paths, and byte-based editor languages', () => {
    expect(createTab('tab-a')).toEqual({ id: 'tab-a', title: 'newTab' });
    expect(createTab('tab-b', 'fixture')).toEqual({ id: 'tab-b', title: 'fixture' });
    expect(getFileName('/tmp/demo.json')).toBe('demo.json');
    expect(getFileName('C:\\data\\demo.json')).toBe('demo.json');
    expect(getLeftModelPath('tab-a')).toContain('/raw/tab-a.json');
    expect(getRightModelPath('tab-a')).toContain('/formatted/tab-a.json');
    expect(getEditorLanguageByLength(LARGE_FILE_THRESHOLD - 1)).toBe('json');
    expect(getEditorLanguageByLength(LARGE_FILE_THRESHOLD)).toBe('plaintext');
  });

  it('reuses models, updates their language, and disposes them by path', () => {
    const model = getOrCreateModel('inmemory://fixture.json', 'json');

    expect(getOrCreateModel('inmemory://fixture.json', 'plaintext')).toBe(model);
    expect(model.getLanguageId()).toBe('plaintext');

    disposeModel('inmemory://fixture.json');
    expect(model.dispose).toHaveBeenCalledTimes(1);
  });

  it('detaches and recreates the active model safely', () => {
    const existing = getOrCreateModel('inmemory://fixture.json', 'json');
    const editor = {
      getModel: vi.fn(() => existing),
      setModel: vi.fn(),
    };

    const next = recreateModel('inmemory://fixture.json', 'plaintext', '{"ok":true}', editor as never);

    expect(editor.setModel).toHaveBeenCalledWith(null);
    expect(existing.dispose).toHaveBeenCalledTimes(1);
    expect(next).not.toBe(existing);
    expect(next.getLanguageId()).toBe('plaintext');
  });

  it('checks whether the current selection covers the full model', () => {
    const fullRange = { endColumn: 2, endLineNumber: 1, startColumn: 1, startLineNumber: 1 };
    const editor = {
      getModel: vi.fn(() => ({ getFullModelRange: () => fullRange })),
      getSelection: vi.fn(() => ({ equalsRange: (range: unknown) => range === fullRange })),
    };

    expect(selectionCoversModel(editor as unknown as monaco.editor.IStandaloneCodeEditor)).toBe(true);
  });
});
