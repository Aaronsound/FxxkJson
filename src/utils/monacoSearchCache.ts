import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { buildLineStarts } from './searchText';

export interface MonacoSearchSnapshot {
  text: string;
  lineStarts: Uint32Array;
  lineCount: number;
}

/** Owned by one search session; discard the snapshot on edits and on close. */
export function createMonacoSearchCache() {
  let cached: { model: monaco.editor.ITextModel; version: number; snapshot: MonacoSearchSnapshot } | null = null;
  return {
    get(model: monaco.editor.ITextModel): MonacoSearchSnapshot {
      const version = model.getVersionId();
      if (cached?.model === model && cached.version === version) return cached.snapshot;
      const text = model.getValue();
      const snapshot = { text, lineStarts: buildLineStarts(text), lineCount: model.getLineCount() };
      cached = { model, version, snapshot };
      return snapshot;
    },
    clear() {
      cached = null;
    },
  };
}
