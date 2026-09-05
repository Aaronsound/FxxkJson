import { describe, expect, it } from 'vitest';
import { comparisonBlockAt, comparisonBlockOffsets } from './comparisonListLayout';

describe('comparison block layout', () => {
  it('supports measured variable heights and partial final blocks', () => {
    const offsets = comparisonBlockOffsets(25, new Map([[1, 1200]]));
    expect(offsets).toEqual([0, 640, 1840, 2160]);
    for (const [top, expected] of [
      [-1, 0],
      [0, 0],
      [639, 0],
      [640, 1],
      [1839, 1],
      [1840, 2],
      [99999, 2],
    ]) {
      expect(comparisonBlockAt(offsets, top)).toBe(expected);
    }
  });
  it('finds every block boundary in a full batch', () => {
    const offsets = comparisonBlockOffsets(2000, new Map());
    for (let i = 0; i < 200; i++) expect(comparisonBlockAt(offsets, offsets[i])).toBe(i);
    expect(comparisonBlockOffsets(0, new Map())).toEqual([0]);
  });
});
