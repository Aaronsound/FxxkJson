// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildLargeRawViewerData, findRawSegmentIndex, getRawSegmentEnd } from './largeRawViewerData';

describe('largeRawViewerData', () => {
  it('splits long raw lines into stable chunks', () => {
    const data = buildLargeRawViewerData(`{"value":"${'x'.repeat(4500)}"}`, 2000);

    expect(Array.from(data.starts)).toEqual([0, 2000, 4000]);
    expect(Array.from(data.lengths)).toEqual([2000, 2000, 512]);
    expect([0, 1, 2].map((index) => getRawSegmentEnd(data, index))).toEqual([2000, 4000, 4512]);
    expect(data.rowCount).toBe(3);
  });

  it('preserves empty lines as visible rows', () => {
    const data = buildLargeRawViewerData('{\n\n}', 2000);

    expect(Array.from(data.starts)).toEqual([0, 2, 3]);
    expect(Array.from(data.lengths)).toEqual([1, 0, 1]);
    expect(data.rowCount).toBe(3);
  });

  it('finds the segment that contains a raw offset', () => {
    const data = buildLargeRawViewerData('a'.repeat(4500), 2000);

    expect(findRawSegmentIndex(data, 0)).toBe(0);
    expect(findRawSegmentIndex(data, 2500)).toBe(1);
    expect(findRawSegmentIndex(data, 4500)).toBe(2);
  });

  it('bounds invalid or oversized chunk sizes to the compact length representation', () => {
    const zeroSized = buildLargeRawViewerData('abcd', 0);
    const oversized = buildLargeRawViewerData('a'.repeat(70_000), 100_000);

    expect(Array.from(zeroSized.lengths)).toEqual([1, 1, 1, 1]);
    expect(Array.from(oversized.lengths)).toEqual([65_535, 4_465]);
  });

  it('preallocates and reuses exact raw-row buffers for long single-line JSON', () => {
    const startsSet = vi.spyOn(Uint32Array.prototype, 'set');
    const lengthsSet = vi.spyOn(Uint16Array.prototype, 'set');
    try {
      const text = 'x'.repeat(2048);
      const data = buildLargeRawViewerData(text, 1);

      expect(data.rowCount).toBe(2048);
      expect(data.starts.length).toBe(2048);
      expect(data.lengths.length).toBe(2048);
      expect(data.starts[2047]).toBe(2047);
      expect(data.starts.buffer).toBe(data.lengths.buffer);
      expect(data.starts.buffer.byteLength).toBe(
        2048 * (Uint32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT)
      );
      expect(startsSet).not.toHaveBeenCalled();
      expect(lengthsSet).not.toHaveBeenCalled();
    } finally {
      startsSet.mockRestore();
      lengthsSet.mockRestore();
    }
  });
});
