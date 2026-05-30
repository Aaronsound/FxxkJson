import { describe, expect, it } from 'vitest';
import { findNearestRegionStartLine } from './largeJsonFoldTarget';

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
});
