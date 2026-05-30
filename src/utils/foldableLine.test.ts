import { describe, expect, it } from 'vitest';
import { findFoldableLineForMode, findNearestFoldableLine, getFoldableLineTargets } from './foldableLine';

function createModel(lines: string[]) {
  return {
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
    getLineCount: () => lines.length,
  };
}

describe('findNearestFoldableLine', () => {
  const model = createModel([
    '{',
    '  "nested": {',
    '    "requestId": "req-00032375",',
    '    "timestamp": "2026-04-27T00:00:00.000Z",',
    '    "values": [',
    '      32375,',
    '      32376',
    '    ]',
    '  }',
    '}',
  ]);

  it('uses the current line when it is an object or array opener', () => {
    expect(findNearestFoldableLine(model, 5)).toBe(5);
  });

  it('uses the closest parent object for scalar fields', () => {
    expect(findNearestFoldableLine(model, 4)).toBe(2);
  });

  it('uses the closest parent array for primitive array values', () => {
    expect(findNearestFoldableLine(model, 6)).toBe(5);
  });

  it('distinguishes current container folds from parent level folds', () => {
    expect(getFoldableLineTargets(model, 5)).toEqual({
      currentLine: 5,
      parentLine: 2,
      nearestLine: 5,
    });
    expect(findFoldableLineForMode(model, 5, 'current')).toBe(5);
    expect(findFoldableLineForMode(model, 5, 'parent')).toBe(2);
  });

  it('falls back to the parent level for scalar current-node fold requests', () => {
    expect(getFoldableLineTargets(model, 4)).toEqual({
      currentLine: null,
      parentLine: 2,
      nearestLine: 2,
    });
    expect(findFoldableLineForMode(model, 4, 'current')).toBe(2);
    expect(findFoldableLineForMode(model, 4, 'parent')).toBe(2);
  });
});
