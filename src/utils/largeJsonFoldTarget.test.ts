import { describe, expect, it } from 'vitest';
import { findNearestRegionStartLine, getRegionFoldTargets } from './largeJsonFoldTarget';

describe('findNearestRegionStartLine', () => {
  const regions = [
    { startLine: 1, endLine: 10, kind: 'object' as const },
    { startLine: 2, endLine: 9, kind: 'object' as const },
    { startLine: 5, endLine: 8, kind: 'array' as const },
  ];

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
