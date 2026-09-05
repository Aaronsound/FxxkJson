import { describe, expect, it, vi } from 'vitest';
import { createComparisonValueReader } from './comparisonValueReader';
import { comparisonValueChunks, ExactJsonNumber, serializeComparisonValue } from './jsonComparisonValues';
import { createJsonComparison, DIFF_VALUE_CHUNK_SIZE } from './jsonDiff';

describe('bounded difference value reading', () => {
  it.each([2, 20, 40])(
    'measures first-section preparation for %i MB without materializing full output',
    (sizeMb) => {
      const value = `${'x'.repeat(sizeMb * 1024 * 1024)}🌍`;
      const before: number[] = [];
      const after: number[] = [];
      for (let run = 0; run < 5; run++) {
        let start = performance.now();
        const serialized = JSON.stringify(value);
        const prefix = serialized.slice(0, 16384);
        before.push(performance.now() - start);
        start = performance.now();
        const reader = createComparisonValueReader(value);
        expect(reader.slice(0, 16384)).toBe(prefix);
        after.push(performance.now() - start);
        expect(reader.total).toBe(serialized.length);
        expect(reader.slice(reader.total - 20, reader.total)).toBe(serialized.slice(-20));
      }
      console.log(
        JSON.stringify({
          sizeMb,
          fullStringThenSliceMs: before.sort((a, b) => a - b)[2],
          indexedFirstSectionMs: after.sort((a, b) => a - b)[2],
        })
      );
    },
    30_000
  ); // Coverage-instrumented large fixtures; timing regression gates run separately.
  it.each([
    '',
    'plain',
    '"\\\n\t\u0000',
    '🌍'.repeat(10000),
    '\ud800x\udc00'.repeat(8000),
    `${'x'.repeat(4095)}🌍${'y'.repeat(4095)}`,
  ])('reads exact sections and arbitrary boundaries for string %#', (value) => {
    const expected = JSON.stringify(value);
    const reader = createComparisonValueReader(value);
    expect(reader.total).toBe(expected.length);
    expect(reader.full()).toBe(expected);
    for (let offset = 0; offset < expected.length; offset += 137)
      expect(reader.slice(offset, offset + 137)).toBe(expected.slice(offset, offset + 137));
    for (const offset of [0, 1, 4095, 4096, expected.length - 1, expected.length, 999999])
      expect(reader.slice(offset, offset + 30)).toBe(expected.slice(offset, offset + 30));
  });
  it('bounds encoding calls for multi-MB strings and compound values', () => {
    const value = { text: 'abc"\\\n🌍'.repeat(150000), number: new ExactJsonNumber('9007199254740993') };
    const expected = serializeComparisonValue(value);
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      for (const source of [value.text, value]) {
        const reader = createComparisonValueReader(source);
        // Use the known compound representation for full order-sensitive checks below.
        expect(reader.total).toBeGreaterThan(1000000);
        expect(reader.slice(0, 100)).toHaveLength(100);
        expect(reader.slice(reader.total - 100, reader.total)).toHaveLength(100);
        expect(reader.slice(0, 100)).toHaveLength(100);
      }
      expect(stringify.mock.calls.every((args) => typeof args[0] !== 'string' || args[0].length <= 4097)).toBe(true);
    } finally {
      stringify.mockRestore();
    }
    const reader = createComparisonValueReader(value);
    for (const start of [0, expected.length - 17000, 10000, 27000, 500, expected.length - 1])
      expect(reader.slice(start, start + 17000)).toBe(expected.slice(start, start + 17000));
    expect(reader.full()).toBe(expected);
  });
  it('bounds serialization of long keys and preserves precise values', () => {
    const value = { ['a'.repeat(30000)]: 'b'.repeat(50000), number: new ExactJsonNumber('1e9999'), zero: -0 };
    const chunks = Array.from(comparisonValueChunks(value));
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThan(25000);
    expect(createComparisonValueReader(value).full()).toBe(serializeComparisonValue(value));
  });
  it('releases detail readers without discarding comparison results or losing unicode boundaries', () => {
    const source = 'x'.repeat(DIFF_VALUE_CHUNK_SIZE - 2) + '🌍'.repeat(20000);
    const comparison = createJsonComparison(JSON.stringify({ value: source }), '{"value":"right"}');
    expect(comparison.next().diffs).toHaveLength(1);
    const expected = JSON.stringify(source);
    let rebuilt = '';
    for (let offset = 0; offset < expected.length; offset += DIFF_VALUE_CHUNK_SIZE)
      rebuilt += comparison.readValue(['value'], 'left', offset).text;
    expect(rebuilt).toBe(expected);
    comparison.releaseValues();
    expect(comparison.readValue(['value'], 'left', 0, true).text).toBe(expected);
    expect(comparison.readValue(['absent'], 'left').missing).toBe(true);
  });
});
