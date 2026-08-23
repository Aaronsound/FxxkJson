// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import {
  binarySearchActualSegment,
  buildHighlightedJsonLineSegments,
  buildLargeJsonRowOffsets,
  findCollapsedInterval,
  getLargeJsonVisibleIndexAtOffset,
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
    const segments = buildHighlightedJsonLineSegments(line, [createMatch(3, 7, 4)], 4);

    expect(segments.map((segment) => segment.text).join('')).toBe(line);
    expect(segments.find((segment) => segment.text === 'name')).toMatchObject({
      isActiveSearchMatch: true,
      isSearchMatch: true,
      matchIndex: 4,
    });
  });

  it('clamps out-of-range matches to the rendered line', () => {
    const segments = buildHighlightedJsonLineSegments('"ok": true', [createMatch(-10, 100, 0)], 1);

    expect(segments.map((segment) => segment.text).join('')).toBe('"ok": true');
    expect(segments.some((segment) => segment.isSearchMatch)).toBe(true);
    expect(segments.some((segment) => segment.isActiveSearchMatch)).toBe(false);
  });

  it('only adds wrapped height to lines that exceed the viewport columns', () => {
    const lines = ['{', `  "payload": "${'x'.repeat(90)}",`, '  "ok": true', '}'];
    const text = lines.join('\n');
    const lineStarts = Uint32Array.from(
      lines.map((_, index) => lines.slice(0, index).reduce((offset, line) => offset + line.length + 1, 0))
    );
    const rowOffsets = buildLargeJsonRowOffsets({
      lineHeight: 18,
      lineStarts,
      textLength: text.length,
      visibleLineCount: lines.length,
      visibleSegments: [{ actualStart: 1, actualEnd: 4, visibleStart: 0, visibleEnd: 3 }],
      wrapColumnCount: 40,
    });

    expect(Array.from(rowOffsets)).toEqual([0, 18, 90, 108, 126]);
    expect(getLargeJsonVisibleIndexAtOffset(rowOffsets, 17)).toBe(0);
    expect(getLargeJsonVisibleIndexAtOffset(rowOffsets, 18)).toBe(1);
    expect(getLargeJsonVisibleIndexAtOffset(rowOffsets, 89)).toBe(1);
    expect(getLargeJsonVisibleIndexAtOffset(rowOffsets, 90)).toBe(2);
    expect(getLargeJsonVisibleIndexAtOffset(rowOffsets, 108)).toBe(3);
  });

  it('locates actual lines and collapsed intervals with boundary-safe binary searches', () => {
    const segments = [
      { actualStart: 1, actualEnd: 10, visibleStart: 0, visibleEnd: 9 },
      { actualStart: 21, actualEnd: 30, visibleStart: 10, visibleEnd: 19 },
      { actualStart: 41, actualEnd: 50, visibleStart: 20, visibleEnd: 29 },
    ];
    const intervals = [
      { start: 11, end: 20, triggerLine: 10 },
      { start: 31, end: 40, triggerLine: 30 },
    ];

    expect(binarySearchActualSegment(segments, 21)).toBe(segments[1]);
    expect(binarySearchActualSegment(segments, 20)).toBeNull();
    expect(findCollapsedInterval(intervals, 11)).toBe(intervals[0]);
    expect(findCollapsedInterval(intervals, 40)).toBe(intervals[1]);
    expect(findCollapsedInterval(intervals, 41)).toBeNull();
  });
});
