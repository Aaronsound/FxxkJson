import { describe, expect, it } from 'vitest';
import {
  findSearchIndexAtOrAfterOffset,
  getSafeOffsetAt,
  type SearchOffsetModel,
} from './searchMatchPosition';

function createOffsetModel(lines: string[]): SearchOffsetModel {
  const lineStarts = lines.reduce<number[]>((starts, line, index) => {
    if (index === 0) {
      starts.push(0);
      return starts;
    }

    starts.push(starts[index - 1] + lines[index - 1].length + 1);
    return starts;
  }, []);

  return {
    getLineCount: () => lines.length,
    getLineMaxColumn: (lineNumber) => lines[lineNumber - 1].length + 1,
    getOffsetAt: ({ lineNumber, column }) => lineStarts[lineNumber - 1] + column - 1,
  };
}

describe('searchMatchPosition', () => {
  it('keeps the active match when content edits happen after that match', () => {
    const model = createOffsetModel([
      '{',
      '  "name": "first edited",',
      '  "name": "second"',
      '}',
    ]);
    const ranges = [
      { startLineNumber: 2, startColumn: 4 },
      { startLineNumber: 3, startColumn: 4 },
    ];
    const previousActiveOffset = getSafeOffsetAt(model, { lineNumber: 2, column: 4 });

    expect(findSearchIndexAtOrAfterOffset(model, ranges, previousActiveOffset)).toBe(0);
  });

  it('continues from the next nearby match when the active key/value is deleted', () => {
    const model = createOffsetModel([
      '{',
      '  "name": "second",',
      '  "name": "third"',
      '}',
    ]);
    const ranges = [
      { startLineNumber: 2, startColumn: 4 },
      { startLineNumber: 3, startColumn: 4 },
    ];
    const deletedKeyOffset = getSafeOffsetAt(model, { lineNumber: 2, column: 4 });

    expect(findSearchIndexAtOrAfterOffset(model, ranges, deletedKeyOffset)).toBe(0);
  });

  it('falls back to the last match instead of jumping to the first when editing near the end', () => {
    const model = createOffsetModel([
      '{',
      '  "name": "first",',
      '  "name": "last"',
      '}',
    ]);
    const ranges = [
      { startLineNumber: 2, startColumn: 4 },
      { startLineNumber: 3, startColumn: 4 },
    ];
    const endOffset = getSafeOffsetAt(model, { lineNumber: 4, column: 1 });

    expect(findSearchIndexAtOrAfterOffset(model, ranges, endOffset)).toBe(1);
  });
});
