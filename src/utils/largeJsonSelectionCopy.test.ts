import { describe, expect, it } from 'vitest';
import type { LargeJsonViewerRegion } from '../types/jsonTool';
import { getCollapsedSelectionText, getCopyTextForCollapsedSelection } from './largeJsonSelectionCopy';

const objectLines = ['{', '  "outer": {', '    "name": "alpha"', '  },', '  "tail": true', '}'];

function getLineTextFactory(lines: string[]) {
  return (lineNumber: number) => lines[lineNumber - 1] ?? '';
}

function createRegions(entries: LargeJsonViewerRegion[]) {
  return new Map(entries.map((region) => [region.startLine, region]));
}

describe('largeJsonSelectionCopy', () => {
  it('returns the whole collapsed object when the collapsed preview is selected', () => {
    const regionsByStartLine = createRegions([{ startLine: 2, endLine: 4, kind: 'object' }]);

    expect(
      getCollapsedSelectionText({
        getLineText: getLineTextFactory(objectLines),
        lineNumber: 2,
        regionsByStartLine,
        startOffset: objectLines[1].lastIndexOf('{'),
      })
    ).toBe(['{', '    "name": "alpha"', '  }'].join('\n'));
  });

  it('keeps the key prefix when collapsed selection starts before the object opener', () => {
    const regionsByStartLine = createRegions([{ startLine: 2, endLine: 4, kind: 'object' }]);

    expect(
      getCollapsedSelectionText({
        getLineText: getLineTextFactory(objectLines),
        lineNumber: 2,
        regionsByStartLine,
        startOffset: 2,
      })
    ).toBe(['  "outer": {', '    "name": "alpha"', '  }'].join('\n'));
  });

  it('returns null when the copied range does not include a collapsed line', () => {
    expect(
      getCopyTextForCollapsedSelection({
        collapsedLineSet: new Set([2]),
        endLine: 6,
        endOffset: 1,
        getLineText: getLineTextFactory(objectLines),
        regionsByStartLine: createRegions([{ startLine: 2, endLine: 4, kind: 'object' }]),
        startLine: 5,
        startOffset: 0,
      })
    ).toBeNull();
  });

  it('expands collapsed regions while preserving selected plain lines around them', () => {
    expect(
      getCopyTextForCollapsedSelection({
        collapsedLineSet: new Set([2]),
        endLine: 5,
        endOffset: objectLines[4].length,
        getLineText: getLineTextFactory(objectLines),
        regionsByStartLine: createRegions([{ startLine: 2, endLine: 4, kind: 'object' }]),
        startLine: 1,
        startOffset: 0,
      })
    ).toBe(['{', '  "outer": {', '    "name": "alpha"', '  }', '  "tail": true'].join('\n'));
  });

  it('removes hidden trailing commas from collapsed array item copies', () => {
    const lines = ['[', '  {', '    "id": 1', '  },', '  {', '    "id": 2', '  }', ']'];

    const copied = getCopyTextForCollapsedSelection({
      collapsedLineSet: new Set([2]),
      endLine: 2,
      endOffset: lines[1].length,
      getLineText: getLineTextFactory(lines),
      regionsByStartLine: createRegions([{ startLine: 2, endLine: 4, kind: 'object' }]),
      startLine: 2,
      startOffset: lines[1].lastIndexOf('{'),
    });

    expect(copied?.trim().endsWith(',')).toBe(false);
    expect(JSON.parse(copied ?? '')).toEqual({ id: 1 });
  });
});
