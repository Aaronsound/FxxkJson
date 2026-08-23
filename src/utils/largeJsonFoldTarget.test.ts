import { describe, expect, it } from 'vitest';
import { findNearestRegionStartLine, getRegionFoldTargets } from './largeJsonFoldTarget';

describe('findNearestRegionStartLine', () => {
  const regions = {
    startLines: new Uint32Array([1, 2, 5]),
    endLines: new Uint32Array([10, 9, 8]),
    parentIndexes: new Int32Array([-1, 0, 1]),
    kinds: new Uint8Array([0, 0, 1]),
  };

  it('uses the current region when right-clicking a foldable opener', () => {
    expect(findNearestRegionStartLine(regions, 5)).toBe(5);
  });

  it('uses the deepest containing parent for scalar lines', () => {
    expect(findNearestRegionStartLine(regions, 4)).toBe(2);
    expect(findNearestRegionStartLine(regions, 6)).toBe(5);
  });

  it('returns null when no containing region exists', () => {
    expect(findNearestRegionStartLine(regions, 11)).toBeNull();
  });

  it('distinguishes current regions from parent regions', () => {
    expect(getRegionFoldTargets(regions, 5)).toEqual({
      currentLine: 5,
      parentLine: 2,
      nearestLine: 5,
    });
    expect(getRegionFoldTargets(regions, 4)).toEqual({
      currentLine: null,
      parentLine: 2,
      nearestLine: 2,
    });
  });
});
