import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { describe, expect, it, vi } from 'vitest';
import { createMonacoSearchCache } from './monacoSearchCache';
import { getMonacoSearchBatch } from './jsonEditorInteractions';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';

function makeModel() {
  let text = 'name\nname\nname';
  let version = 1;
  const getValue = vi.fn(() => text);
  return {
    getValue,
    change(next: string) {
      text = next;
      version += 1;
    },
    model: {
      getVersionId: () => version,
      getValue,
      getLineCount: () => text.split('\n').length,
      getPositionAt: (offset: number) => {
        const prefix = text.slice(0, offset).split('\n');
        return { lineNumber: prefix.length, column: prefix[prefix.length - 1].length + 1 };
      },
    } as unknown as monaco.editor.ITextModel,
  };
}

describe('editor search snapshots', () => {
  it('reuses text and line indexes across search terms and result batches', () => {
    const { model, getValue } = makeModel();
    const cache = createMonacoSearchCache();
    const snapshot = cache.get(model);
    const first = getMonacoSearchBatch(model, 'name', DEFAULT_SEARCH_OPTIONS, 0, 1, snapshot);
    const next = getMonacoSearchBatch(
      model,
      'name',
      DEFAULT_SEARCH_OPTIONS,
      first.nextStartOffset,
      1,
      cache.get(model)
    );
    getMonacoSearchBatch(model, 'absent', DEFAULT_SEARCH_OPTIONS, 0, 1, cache.get(model));
    expect(first.ranges[0].startLineNumber).toBe(1);
    expect(next.ranges[0].startLineNumber).toBe(2);
    expect(cache.get(model)).toBe(snapshot);
    expect(getValue).toHaveBeenCalledTimes(1);
  });

  it('refreshes after same-length edits, model changes, and closing a search', () => {
    const source = makeModel();
    const cache = createMonacoSearchCache();
    const before = cache.get(source.model);
    source.change('xxxx\nname\nname');
    const after = cache.get(source.model);
    expect(after).not.toBe(before);
    expect(
      getMonacoSearchBatch(source.model, 'name', DEFAULT_SEARCH_OPTIONS, 0, 1, after).ranges[0].startLineNumber
    ).toBe(2);
    const other = makeModel();
    expect(cache.get(other.model).text).toBe('name\nname\nname');
    cache.clear();
    cache.get(other.model);
    expect(other.getValue).toHaveBeenCalledTimes(2);
  });
});
