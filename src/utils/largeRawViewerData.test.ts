// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildLargeRawViewerData, findRawSegmentIndex } from './largeRawViewerData';

describe('largeRawViewerData', () => {
  it('splits long raw lines into stable chunks', () => {
    const data = buildLargeRawViewerData(`{"value":"${'x'.repeat(4500)}"}`, 2000);

    expect(Array.from(data.starts)).toEqual([0, 2000, 4000]);
    expect(Array.from(data.ends)).toEqual([2000, 4000, 4512]);
    expect(data.rowCount).toBe(3);
  });

  it('preserves empty lines as visible rows', () => {
    const data = buildLargeRawViewerData('{\n\n}', 2000);

    expect(Array.from(data.starts)).toEqual([0, 2, 3]);
    expect(Array.from(data.ends)).toEqual([1, 2, 4]);
    expect(data.rowCount).toBe(3);
  });

  it('finds the segment that contains a raw offset', () => {
    const data = buildLargeRawViewerData('a'.repeat(4500), 2000);

    expect(findRawSegmentIndex(data, 0)).toBe(0);
    expect(findRawSegmentIndex(data, 2500)).toBe(1);
    expect(findRawSegmentIndex(data, 4500)).toBe(2);
  });
});
