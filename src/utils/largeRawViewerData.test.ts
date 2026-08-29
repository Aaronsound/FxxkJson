// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildEscapedStringLiteralRawViewerData,
  buildLargeRawViewerLayoutData,
  buildLargeRawViewerData,
  findRawSegmentIndex,
  getRawSegmentEnd,
  RAW_SYNTAX_ESCAPED,
  RAW_SYNTAX_IN_STRING,
  RAW_SYNTAX_KEY_STRING,
} from './largeRawViewerData';

describe('largeRawViewerData', () => {
  it('builds an immediate layout without scanning syntax state', () => {
    const text = `{"value":"${'x'.repeat(4500)}"}`;
    const layout = buildLargeRawViewerLayoutData(text, 2000);
    const complete = buildLargeRawViewerData(text, 2000);

    expect(Array.from(layout.starts)).toEqual(Array.from(complete.starts));
    expect(Array.from(layout.lengths)).toEqual(Array.from(complete.lengths));
    expect(Array.from(layout.lineNumbers)).toEqual(Array.from(complete.lineNumbers));
    expect(Array.from(layout.syntaxStates)).toEqual([0, 0, 0]);
    expect(Array.from(complete.syntaxStates)).toEqual([0, RAW_SYNTAX_IN_STRING, RAW_SYNTAX_IN_STRING]);
  });

  it('builds escaped string literal layouts from length without scanning text', () => {
    const data = buildEscapedStringLiteralRawViewerData(4501, 2000);

    expect(Array.from(data.starts)).toEqual([0, 2000, 4000]);
    expect(Array.from(data.lengths)).toEqual([2000, 2000, 501]);
    expect(Array.from(data.lineNumbers)).toEqual([1, 0, 0]);
    expect(Array.from(data.syntaxStates)).toEqual([8, 8, 8]);
  });
  it('splits long raw lines into stable chunks', () => {
    const data = buildLargeRawViewerData(`{"value":"${'x'.repeat(4500)}"}`, 2000);

    expect(Array.from(data.starts)).toEqual([0, 2000, 4000]);
    expect(Array.from(data.lengths)).toEqual([2000, 2000, 512]);
    expect(Array.from(data.lineNumbers)).toEqual([1, 0, 0]);
    expect(Array.from(data.syntaxStates)).toEqual([0, RAW_SYNTAX_IN_STRING, RAW_SYNTAX_IN_STRING]);
    expect([0, 1, 2].map((index) => getRawSegmentEnd(data, index))).toEqual([2000, 4000, 4512]);
    expect(data.rowCount).toBe(3);
  });

  it('preserves empty lines as visible rows', () => {
    const data = buildLargeRawViewerData('{\n\n}', 2000);

    expect(Array.from(data.starts)).toEqual([0, 2, 3]);
    expect(Array.from(data.lengths)).toEqual([1, 0, 1]);
    expect(Array.from(data.lineNumbers)).toEqual([1, 2, 3]);
    expect(data.rowCount).toBe(3);
  });

  it('records key/value string and escape continuation state at chunk boundaries', () => {
    const valueData = buildLargeRawViewerData(`{"value":"${'x'.repeat(12)}"}`, 5);
    const escapedData = buildLargeRawViewerData(`{"value":"abc\\"${'x'.repeat(8)}"}`, 14);
    const longKeyData = buildLargeRawViewerData(`{"${'k'.repeat(12)}":1}`, 5);

    expect(Array.from(valueData.syntaxStates)).toContain(RAW_SYNTAX_IN_STRING);
    expect(Array.from(longKeyData.syntaxStates)).toContain(RAW_SYNTAX_IN_STRING | RAW_SYNTAX_KEY_STRING);
    expect(Array.from(escapedData.syntaxStates)).toContain(RAW_SYNTAX_IN_STRING | RAW_SYNTAX_ESCAPED);
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
      expect(data.starts.buffer).toBe(data.lineNumbers.buffer);
      expect(data.starts.buffer).toBe(data.syntaxStates.buffer);
      expect(data.starts.buffer.byteLength).toBe(
        2048 * (Uint32Array.BYTES_PER_ELEMENT * 2 + Uint16Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT)
      );
      expect(startsSet).not.toHaveBeenCalled();
      expect(lengthsSet).not.toHaveBeenCalled();
    } finally {
      startsSet.mockRestore();
      lengthsSet.mockRestore();
    }
  });
});
