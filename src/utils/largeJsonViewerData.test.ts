import { describe, expect, it } from 'vitest';
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
      'name'
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
});
