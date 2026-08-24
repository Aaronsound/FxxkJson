import { describe, expect, it, vi } from 'vitest';
import { findFirstEditFoldRegionIndex, findJsonFoldEndLine } from './jsonEditFolding';

describe('findFirstEditFoldRegionIndex', () => {
  it('uses logarithmic lookup for a deep visible range', () => {
    const getStartLineNumber = vi.fn((index: number) => index * 2 + 1);
    const regions = {
      length: 200_000,
      getStartLineNumber,
    };

    expect(findFirstEditFoldRegionIndex(regions, 350_000)).toBe(175_000);
    expect(getStartLineNumber.mock.calls.length).toBeLessThan(20);
  });

  it('returns the first duplicate region on the visible line', () => {
    const starts = [1, 4, 4, 4, 8];
    const regions = {
      length: starts.length,
      getStartLineNumber: (index: number) => starts[index] ?? Number.POSITIVE_INFINITY,
    };

    expect(findFirstEditFoldRegionIndex(regions, 4)).toBe(1);
    expect(findFirstEditFoldRegionIndex(regions, 9)).toBe(starts.length);
  });
});

describe('findJsonFoldEndLine', () => {
  const createModel = (lines: string[]) =>
    ({
      getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
      getLineCount: () => lines.length,
    }) as never;

  it('finds multiline objects and arrays that start after a JSON property key', () => {
    expect(findJsonFoldEndLine(createModel(['  "nested": {', '    "ok": true', '  }', '}']), 1)).toBe(3);
    expect(findJsonFoldEndLine(createModel(['  "tags": [', '    "json"', '  ]', '}']), 1)).toBe(3);
  });

  it('ignores bracket characters inside JSON strings', () => {
    expect(findJsonFoldEndLine(createModel(['  "message": "not a { fold ["', '}']), 1)).toBeNull();
  });
});
