// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import {
  buildHighlightedJsonLineSegments,
  tokenizeJsonLine,
} from './largeJsonViewerRender';

function createMatch(
  localStart: number,
  localEnd: number,
  matchIndex: number
): LargeJsonSearchMatch & { matchIndex: number } {
  return {
    end: localEnd,
    lineNumber: 1,
    lineStartOffset: 0,
    localEnd,
    localStart,
    matchIndex,
    start: localStart,
  };
}

describe('largeJsonViewerRender', () => {
  it('tokenizes JSON keys, strings, numbers, and punctuation', () => {
    const tokens = tokenizeJsonLine('  "name": "FxxkJson", "count": 2');

    expect(tokens.some((token) => token.className?.includes('large-json-token-key'))).toBe(true);
    expect(tokens.some((token) => token.className?.includes('large-json-token-string'))).toBe(true);
    expect(tokens.some((token) => token.className?.includes('large-json-token-number'))).toBe(true);
    expect(tokens.some((token) => token.className?.includes('large-json-token-punctuation'))).toBe(true);
  });

  it('splits syntax-highlighted segments around search matches', () => {
    const line = '  "name": "FxxkJson"';
    const segments = buildHighlightedJsonLineSegments(
      line,
      [createMatch(3, 7, 4)],
      4
    );

    expect(segments.map((segment) => segment.text).join('')).toBe(line);
    expect(segments.find((segment) => segment.text === 'name')).toMatchObject({
      isActiveSearchMatch: true,
      isSearchMatch: true,
      matchIndex: 4,
    });
  });

  it('clamps out-of-range matches to the rendered line', () => {
    const segments = buildHighlightedJsonLineSegments(
      '"ok": true',
      [createMatch(-10, 100, 0)],
      1
    );

    expect(segments.map((segment) => segment.text).join('')).toBe('"ok": true');
    expect(segments.some((segment) => segment.isSearchMatch)).toBe(true);
    expect(segments.some((segment) => segment.isActiveSearchMatch)).toBe(false);
  });
});
