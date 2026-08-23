// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import { packSearchMatches, unpackSearchMatches } from './searchMatchPayload';

describe('searchMatchPayload', () => {
  it('round-trips search matches through a compact typed payload', () => {
    const matches: LargeJsonSearchMatch[] = [
      { start: 10, end: 15, lineNumber: 2, lineStartOffset: 8, localStart: 2, localEnd: 7 },
      { start: 40, end: 44, lineNumber: 5, lineStartOffset: 36, localStart: 4, localEnd: 8 },
    ];

    const packed = packSearchMatches(matches);

    expect(packed).toBeInstanceOf(Uint32Array);
    expect(packed.byteLength).toBe(2 * 6 * Uint32Array.BYTES_PER_ELEMENT);
    expect(unpackSearchMatches(packed)).toEqual([
      { ...matches[0], matchIndex: 0 },
      { ...matches[1], matchIndex: 1 },
    ]);
  });

  it('rejects malformed payloads', () => {
    expect(unpackSearchMatches(new Uint32Array(5))).toBeNull();
    expect(unpackSearchMatches(undefined)).toBeNull();
  });
});
