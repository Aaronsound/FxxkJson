import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD } from '../types/jsonTool';
import {
  buildLargeViewerData,
  findSearchMatchesInLargeJson,
} from './largeJsonViewerData';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');

function readFormattedSample(fileName: string) {
  const filePath = path.join(repoRoot, 'json', fileName);
  const raw = readFileSync(filePath, 'utf8');
  return JSON.stringify(JSON.parse(raw), null, 2);
}

describe('largeJsonViewerData', () => {
  it('keeps 5MB samples on the Monaco path', () => {
    const formatted = readFormattedSample('sample-5mb.json');
    expect(buildLargeViewerData(formatted)).toBeNull();
  });

  it('routes 10MB and 20MB samples into the dedicated large viewer path', () => {
    const formatted10 = readFormattedSample('sample-10mb.json');
    const formatted20 = readFormattedSample('sample-20mb.json');

    const viewer10 = buildLargeViewerData(formatted10);
    const viewer20 = buildLargeViewerData(formatted20);

    expect(viewer10).not.toBeNull();
    expect(viewer20).not.toBeNull();
    expect(viewer10?.lineCount).toBeGreaterThan(DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD);
    expect(viewer20?.lineCount).toBeGreaterThan(DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD);
    expect(viewer10?.regions.length).toBeGreaterThan(0);
    expect(viewer20?.regions.length).toBeGreaterThan(0);
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
