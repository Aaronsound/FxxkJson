import { describe, expect, it } from 'vitest';
import { applyJsonTextPatch, createJsonTextPatch } from './jsonTextPatch';
import { measureJsonDocument, patchJsonDocumentMetrics } from './jsonDocumentMetrics';

describe('patchJsonDocumentMetrics', () => {
  it('updates UTF-8 bytes and line counts from a small patch', () => {
    const source = '{\n  "name": "old",\n  "emoji": "😀"\n}';
    const updated = '{\n  "name": "新值",\n  "emoji": "😀"\n}';
    const patch = createJsonTextPatch(source, updated);

    expect(applyJsonTextPatch(source, patch)).toBe(updated);
    expect(patchJsonDocumentMetrics(source, measureJsonDocument(source), patch)).toEqual(measureJsonDocument(updated));
  });

  it('handles inserted and removed newlines and rejects a stale source', () => {
    const source = '[1,2]';
    const updated = '[\n  1,\n  2\n]';
    const patch = createJsonTextPatch(source, updated);

    expect(patchJsonDocumentMetrics(source, measureJsonDocument(source), patch)).toEqual(measureJsonDocument(updated));
    expect(patchJsonDocumentMetrics(`${source} `, measureJsonDocument(source), patch)).toBeNull();
  });
});
