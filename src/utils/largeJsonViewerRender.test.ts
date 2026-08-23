// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import {
  binarySearchActualSegment,
  buildAllExceptCollapsedIntervals,
  buildHighlightedJsonLineSegments,
  buildLargeJsonLongRowIndexes,
  buildLargeJsonWrapLayout,
  findCollapsedInterval,
  getActualLineNumberFromVisibleSegments,
  getLargeJsonContentHeight,
  getLargeJsonRowHeight,
  getLargeJsonRowLayout,
  getLargeJsonRowTop,
  getLargeJsonVisibleIndexAtOffset,
  getVisibleIndexFromVisibleSegments,
  projectLargeJsonLongRowIndexes,
  tokenizeJsonLine,
  visitJsonLineTokens,
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

  it('keeps JSON number grammar boundaries without slicing the remaining line', () => {
    const line = '[-0,0,12,-12.34e+5,1.,01,1e]';
    const numberTexts = tokenizeJsonLine(line)
      .filter((token) => token.className?.includes('large-json-token-number'))
      .map((token) => line.slice(token.start, token.end));

    expect(numberTexts).toEqual(['-0', '0', '12', '-12.34e+5', '1', '0', '1', '1']);
  });

  it('preserves JavaScript whitespace handling for key detection', () => {
    const line = '\t"name"\u00a0:\t1\u3000';
    const tokens = tokenizeJsonLine(line);
    const key = tokens.find((token) => line.slice(token.start, token.end) === '"name"');

    expect(key?.className).toContain('large-json-token-key');
    expect(line.slice(tokens[0].start, tokens[0].end)).toBe('\t');
    expect(tokens.at(-1)).toMatchObject({ start: line.length - 1, end: line.length });
  });

  it('recognizes literals and punctuation without per-character candidate arrays', () => {
    const line = '{"a":true,"b":false,"c":null,"prefix":trueValue}';
    const tokens = tokenizeJsonLine(line);
    const literalTexts = tokens
      .filter((token) => token.className?.includes('large-json-token-literal'))
      .map((token) => line.slice(token.start, token.end));
    const punctuationText = tokens
      .filter((token) => token.className?.includes('large-json-token-punctuation'))
      .map((token) => line.slice(token.start, token.end))
      .join('');

    expect(literalTexts).toEqual(['true', 'false', 'null', 'true']);
    expect(punctuationText).toBe('{:,:,:,:}');
  });

  it('visits syntax tokens without changing public tokenizer boundaries', () => {
    const line = '  "value": -12.5e+2';
    const visited: Array<{ start: number; end: number; className?: string }> = [];

    visitJsonLineTokens(line, (start, end, className) => visited.push({ start, end, className }));

    expect(visited).toEqual(tokenizeJsonLine(line));
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

  it('streams ordered line matches while skipping empty clamped ranges', () => {
    const line = '"alpha beta"';
    const segments = buildHighlightedJsonLineSegments(
      line,
      [createMatch(-4, -1, 0), createMatch(1, 6, 1), createMatch(7, 11, 2)],
      2
    );

    expect(segments.map((segment) => segment.text).join('')).toBe(line);
    expect(segments.filter((segment) => segment.isSearchMatch).map((segment) => segment.text)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(segments.find((segment) => segment.isActiveSearchMatch)?.text).toBe('beta');
  });

  it('only adds wrapped height to lines that exceed the viewport columns', () => {
    const lines = ['{', `  "payload": "${'x'.repeat(90)}",`, '  "ok": true', '}'];
    const text = lines.join('\n');
    const lineStarts = Uint32Array.from(
      lines.map((_, index) => lines.slice(0, index).reduce((offset, line) => offset + line.length + 1, 0))
    );
    const wrapLayout = buildLargeJsonWrapLayout({
      lineHeight: 18,
      lineStarts,
      textLength: text.length,
      visibleLineCount: lines.length,
      visibleSegments: [{ actualStart: 1, actualEnd: 4, visibleStart: 0, visibleEnd: 3 }],
      wrapColumnCount: 40,
    });

    expect(Array.from(wrapLayout.longRowIndexes)).toEqual([1]);
    expect(wrapLayout.longRowIndexes.byteLength).toBeLessThan((lines.length + 1) * Uint32Array.BYTES_PER_ELEMENT);
    expect([0, 1, 2, 3].map((index) => getLargeJsonRowTop(wrapLayout, index))).toEqual([0, 18, 90, 108]);
    expect(getLargeJsonContentHeight(wrapLayout)).toBe(126);
    expect(getLargeJsonRowHeight(wrapLayout, 0)).toBe(18);
    expect(getLargeJsonRowHeight(wrapLayout, 1)).toBe(72);
    expect(getLargeJsonRowLayout(wrapLayout, 0)).toEqual({ height: 18, top: 0 });
    expect(getLargeJsonRowLayout(wrapLayout, 1)).toEqual({ height: 72, top: 18 });
    expect(getLargeJsonVisibleIndexAtOffset(wrapLayout, 17)).toBe(0);
    expect(getLargeJsonVisibleIndexAtOffset(wrapLayout, 18)).toBe(1);
    expect(getLargeJsonVisibleIndexAtOffset(wrapLayout, 89)).toBe(1);
    expect(getLargeJsonVisibleIndexAtOffset(wrapLayout, 90)).toBe(2);
    expect(getLargeJsonVisibleIndexAtOffset(wrapLayout, 108)).toBe(3);
  });

  it('locates offsets with one binary search across multiple wrapped rows', () => {
    const wrapLayout = {
      lineHeight: 10,
      longRowIndexes: Uint32Array.from([1, 3, 8]),
      visibleLineCount: 10,
    };

    const expectedIndexes = [0, 1, 1, 1, 1, 2, 3, 3, 3, 3, 4, 5, 6, 7, 8, 8, 8, 8, 9];
    expect(expectedIndexes.map((_, rowOffset) => getLargeJsonVisibleIndexAtOffset(wrapLayout, rowOffset * 10))).toEqual(
      expectedIndexes
    );
    expect(getLargeJsonVisibleIndexAtOffset(wrapLayout, -100)).toBe(0);
    expect(getLargeJsonVisibleIndexAtOffset(wrapLayout, 10_000)).toBe(9);
  });

  it('reuses document long-row indexes and projects them around collapsed lines', () => {
    const lines = ['short', 'x'.repeat(20), 'short', 'y'.repeat(20), 'short', 'z'.repeat(20)];
    const text = lines.join('\n');
    const lineStarts = Uint32Array.from([0, 6, 27, 33, 54, 60]);
    const actualLongRowIndexes = buildLargeJsonLongRowIndexes({
      lineStarts,
      textLength: text.length,
      wrapColumnCount: 10,
    });

    expect(Array.from(actualLongRowIndexes)).toEqual([1, 3, 5]);
    expect(
      projectLargeJsonLongRowIndexes(actualLongRowIndexes, lines.length, 4, [
        { actualStart: 1, actualEnd: 2, visibleStart: 0, visibleEnd: 1 },
        { actualStart: 5, actualEnd: 6, visibleStart: 2, visibleEnd: 3 },
      ])
    ).toEqual(Uint32Array.from([1, 3]));
    expect(
      projectLargeJsonLongRowIndexes(actualLongRowIndexes, lines.length, lines.length, [
        { actualStart: 1, actualEnd: 6, visibleStart: 0, visibleEnd: 5 },
      ])
    ).toBe(actualLongRowIndexes);
  });

  it('skips hidden descendant regions while preserving same-line sibling boundaries', () => {
    const regions = {
      startLines: Uint32Array.from([1, 2, 3, 5]),
      endLines: Uint32Array.from([10, 5, 4, 9]),
      parentIndexes: Int32Array.from([-1, 0, 1, 0]),
      kinds: Uint8Array.from([0, 1, 0, 0]),
    };

    expect(buildAllExceptCollapsedIntervals(regions, new Set())).toEqual([{ start: 2, end: 9, triggerLine: 1 }]);
    expect(buildAllExceptCollapsedIntervals(regions, new Set([1]))).toEqual([
      { start: 3, end: 4, triggerLine: 2 },
      { start: 6, end: 8, triggerLine: 5 },
    ]);
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

  it('maps a single visible segment directly while preserving multi-segment gaps', () => {
    const singleSegment = [{ actualStart: 5, actualEnd: 9, visibleStart: 2, visibleEnd: 6 }];
    const multipleSegments = [
      { actualStart: 1, actualEnd: 3, visibleStart: 0, visibleEnd: 2 },
      { actualStart: 8, actualEnd: 10, visibleStart: 3, visibleEnd: 5 },
    ];

    expect(getActualLineNumberFromVisibleSegments(singleSegment, 4)).toBe(7);
    expect(getActualLineNumberFromVisibleSegments(singleSegment, 1)).toBeNull();
    expect(getVisibleIndexFromVisibleSegments(singleSegment, 7)).toBe(4);
    expect(getVisibleIndexFromVisibleSegments(singleSegment, 10)).toBeNull();
    expect(getActualLineNumberFromVisibleSegments(multipleSegments, 4)).toBe(9);
    expect(getVisibleIndexFromVisibleSegments(multipleSegments, 9)).toBe(4);
    expect(getVisibleIndexFromVisibleSegments(multipleSegments, 5)).toBeNull();
  });
});
