import { describe, expect, it } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import {
  buildLargeViewerData,
  findSearchMatchesInLargeJson,
} from './largeJsonViewerData';

function buildLineRichFormattedSample(lineCount: number) {
  const itemLines = Math.max(0, lineCount - 2);
  const lines = new Array<string>(lineCount);
  lines[0] = '[';

  for (let index = 0; index < itemLines; index += 1) {
    const comma = index === itemLines - 1 ? '' : ',';
    lines[index + 1] = `  {"id":${index},"name":"HanJson","payload":"sample"}${comma}`;
  }

  lines[lineCount - 1] = ']';
  return lines.join('\n');
}

describe('largeJsonViewerData', () => {
  it('builds viewer data without a line-count gate by default', () => {
    const formatted = buildLineRichFormattedSample(10);
    const viewer = buildLargeViewerData(formatted);

    expect(viewer).not.toBeNull();
    expect(viewer?.lineCount).toBe(10);
  });

  it('still supports an explicit line threshold when needed', () => {
    const formatted = buildLineRichFormattedSample(10);

    expect(buildLargeViewerData(formatted, 10)).toBeNull();
    expect(buildLargeViewerData(formatted, 9)?.lineCount).toBe(10);
  });

  it('builds stable search matches with line offsets', () => {
    const text = [
      '{',
      '  "name": "HanJson",',
      '  "nested": {',
      '    "name": "viewer"',
      '  }',
      '}',
    ].join('\n');

    const viewerData = buildLargeViewerData(text, 1);
    expect(viewerData).not.toBeNull();

    const matches = findSearchMatchesInLargeJson(
      text,
      viewerData!.lineStarts,
      viewerData!.lineCount,
      'name',
      DEFAULT_SEARCH_OPTIONS
    );

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      lineNumber: 2,
      localStart: 3,
      localEnd: 7,
    });
    expect(matches[1]).toMatchObject({
      lineNumber: 4,
      localStart: 5,
      localEnd: 9,
    });
  });

  it('finds matches case-insensitively without changing line offsets', () => {
    const text = [
      '{',
      '  "name": "HanJson",',
      '  "label": "hanjson viewer"',
      '}',
    ].join('\n');
    const viewerData = buildLargeViewerData(text, 1);
    expect(viewerData).not.toBeNull();

    const matches = findSearchMatchesInLargeJson(
      text,
      viewerData!.lineStarts,
      viewerData!.lineCount,
      'HANJSON',
      DEFAULT_SEARCH_OPTIONS
    );

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      lineNumber: 2,
      localStart: 11,
      localEnd: 18,
    });
    expect(matches[1]).toMatchObject({
      lineNumber: 3,
      localStart: 12,
      localEnd: 19,
    });
  });

  it('applies whole-word and regex search options in the large viewer data helper', () => {
    const text = [
      '{',
      '  "id": "abc",',
      '  "requestId": "abc-001"',
      '}',
    ].join('\n');
    const viewerData = buildLargeViewerData(text, 1);
    expect(viewerData).not.toBeNull();

    const wholeWordMatches = findSearchMatchesInLargeJson(
      text,
      viewerData!.lineStarts,
      viewerData!.lineCount,
      'id',
      {
        ...DEFAULT_SEARCH_OPTIONS,
        wholeWord: true,
      }
    );
    expect(wholeWordMatches).toHaveLength(1);

    const regexMatches = findSearchMatchesInLargeJson(
      text,
      viewerData!.lineStarts,
      viewerData!.lineCount,
      'abc-\\d+',
      {
        ...DEFAULT_SEARCH_OPTIONS,
        useRegex: true,
      }
    );
    expect(regexMatches).toHaveLength(1);
    expect(regexMatches[0]).toMatchObject({
      lineNumber: 3,
    });
  });
});
