// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getJsonPathLocateRange } from './jsonPathLocate';

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
});
