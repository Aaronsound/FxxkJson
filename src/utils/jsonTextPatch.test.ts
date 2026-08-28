import { describe, expect, it } from 'vitest';
import {
  applyJsonTextPatch,
  canInlineJsonTextPatch,
  createJsonTextPatch,
  patchLargeJsonLineIndex,
} from './jsonTextPatch';

describe('jsonTextPatch', () => {
  it('creates and applies a minimal replacement', () => {
    const source = '{"name":"old","count":1}';
    const updated = '{"name":"updated","count":1}';
    const patch = createJsonTextPatch(source, updated);

    expect(patch).toEqual({
      sourceLength: source.length,
      startOffset: 9,
      endOffset: 11,
      text: 'update',
    });
    expect(applyJsonTextPatch(source, patch)).toBe(updated);
    expect(applyJsonTextPatch(`${source} `, patch)).toBeNull();
    expect(canInlineJsonTextPatch(patch)).toBe(true);
  });

  it('shifts only line starts after a same-line patch', () => {
    const source = '{\n  "name": "old",\n  "count": 1\n}';
    const updated = '{\n  "name": "updated",\n  "count": 1\n}';
    const patch = createJsonTextPatch(source, updated);
    const lineStarts = Uint32Array.from([0, 2, 19, 32]);
    const patched = patchLargeJsonLineIndex({ lineCount: 4, lineStarts }, patch);

    expect(Array.from(patched.lineStarts)).toEqual([0, 2, 23, 36]);
    expect(Array.from(lineStarts)).toEqual([0, 2, 19, 32]);
  });
});
