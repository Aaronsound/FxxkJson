// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getJsonOffsetLocateResult, getJsonPathLocateRange } from './jsonPathLocate';

describe('getJsonPathLocateRange', () => {
  it('locates a repeated raw token by JSON path instead of token occurrence guessing', () => {
    const raw = '[{"requestId":"same","nested":{"value":1}},{"requestId":"same","nested":{"value":2}}]';
    const range = getJsonPathLocateRange(raw, [1, 'requestId']);

    expect(range).not.toBeNull();
    expect(raw.slice(range?.startOffset, range?.endOffset)).toBe('"same"');
    expect(range?.startOffset).toBe(raw.lastIndexOf('"same"'));
  });

  it('returns null for missing paths or empty text', () => {
    expect(getJsonPathLocateRange('', ['missing'])).toBeNull();
    expect(getJsonPathLocateRange('{"ok":true}', ['missing'])).toBeNull();
  });

  it('returns complete object, array, and root container ranges without a syntax tree', () => {
    const raw = '{"items":[{"id":1},{"id":2}],"ok":true}';
    const objectRange = getJsonPathLocateRange(raw, ['items', 1]);
    const arrayRange = getJsonPathLocateRange(raw, ['items']);
    const rootRange = getJsonPathLocateRange(raw, []);

    expect(raw.slice(objectRange?.startOffset, objectRange?.endOffset)).toBe('{"id":2}');
    expect(raw.slice(arrayRange?.startOffset, arrayRange?.endOffset)).toBe('[{"id":1},{"id":2}]');
    expect(raw.slice(rootRange?.startOffset, rootRange?.endOffset)).toBe(raw);
  });

  it('resolves literal, property-key, and container offsets with their JSON paths and ranges', () => {
    const raw = '{"items":[{"id":1},{"id":2}],"ok":true}';

    expect(getJsonOffsetLocateResult(raw, raw.lastIndexOf('2'))).toEqual({
      path: ['items', 1, 'id'],
      range: { startOffset: raw.lastIndexOf('2'), endOffset: raw.lastIndexOf('2') + 1 },
    });
    expect(getJsonOffsetLocateResult(raw, raw.indexOf('items') + 1)).toEqual({
      path: ['items'],
      range: {
        startOffset: raw.indexOf('['),
        endOffset: raw.indexOf(']') + 1,
      },
    });
    expect(getJsonOffsetLocateResult(raw, raw.indexOf('{', 1))).toEqual({
      path: ['items', 0],
      range: {
        startOffset: raw.indexOf('{', 1),
        endOffset: raw.indexOf('}', raw.indexOf('{', 1)) + 1,
      },
    });
  });

  it('stops after finding an early path instead of parsing an invalid trailing suffix', () => {
    const text = '{"target":1,"broken":[';

    expect(getJsonPathLocateRange(text, ['target'])).toEqual({
      startOffset: text.indexOf('1'),
      endOffset: text.indexOf('1') + 1,
    });
  });
});
