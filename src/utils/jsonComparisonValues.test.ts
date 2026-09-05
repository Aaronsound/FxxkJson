// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  comparisonScalarsEqual,
  ExactJsonNumber,
  normalizeJsonNumber,
  parseComparisonJson,
  serializeComparisonValue,
} from './jsonComparisonValues';
import { compareJsonTexts, createJsonComparison, DIFF_VALUE_CHUNK_SIZE } from './jsonDiff';

describe('lossless JSON comparisons', () => {
  it('preserves randomly generated decimal tokens across precision and exponent boundaries', () => {
    let state = 19;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    for (let index = 0; index < 3000; index += 1) {
      let digits = String((random() % 9) + 1);
      const length = (random() % 24) + 1;
      while (digits.length < length) digits += String(random() % 10);
      const split = random() % digits.length;
      const mantissa = split === 0 ? digits : `${digits.slice(0, split)}.${digits.slice(split)}`;
      const raw = `${random() % 2 ? '-' : ''}${mantissa}e${(random() % 701) - 350}`;
      expect(normalizeJsonNumber(serializeComparisonValue(parseComparisonJson(raw))), raw).toBe(
        normalizeJsonNumber(raw)
      );
    }
    for (const raw of ['0.000000000000000000000000000001', '1e-0000324', '1e+0000400', '1.23456789012345e-307']) {
      expect(normalizeJsonNumber(serializeComparisonValue(parseComparisonJson(raw)))).toBe(normalizeJsonNumber(raw));
    }
  });
  it.each([
    ['9007199254740992', '9007199254740993'],
    ['0.12345678901234567890', '0.12345678901234567891'],
    ['1e400', '2e400'],
    ['1e-400', '0'],
    ['-9007199254740993', '-9007199254740992'],
    ['0.10000000000000001', '0.1'],
    ['-0', '0'],
    ['1e99999999999999999999', '1e99999999999999999998'],
  ])('distinguishes %s from %s', (left, right) => {
    const result = compareJsonTexts(`{"n":${left}}`, `{"n":${right}}`);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].pathText).toBe('$.n');
    expect(result.diffs[0].leftPreview).not.toBe(result.diffs[0].rightPreview);
  });
  it.each([
    ['1', '1.0'],
    ['1', '1e0'],
    ['0.1', '1e-1'],
    ['-0', '-0.000'],
    ['0', '0e9999'],
    ['9007199254740993', '90071992547409930e-1'],
    ['1e400', '10e399'],
    ['1e-400', '10e-401'],
    ['0.10000000000000001', '10000000000000001e-17'],
    ['1e99999999999999999999', '10e99999999999999999998'],
  ])('preserves numeric equivalence for %s and %s', (left, right) => {
    expect(compareJsonTexts(`[${left}]`, `[${right}]`).diffs).toEqual([]);
  });
  it('keeps strings, number-like keys, duplicates, __proto__, and missing values distinct', () => {
    const source =
      '{"__proto__":{"x":1},"9007199254740993":"9007199254740993","escaped\\\"key":"quote\\\"", "empty":"","dup":false,"dup":null,"arr":[true,false,null,9007199254740993]}';
    const serialized = serializeComparisonValue(parseComparisonJson(source));
    expect(serialized).toContain('"__proto__":{"x":1}');
    expect(serialized).toContain('"dup":null');
    expect(serialized).not.toContain('"dup":false');
    expect(serialized).toContain('"9007199254740993":"9007199254740993"');
    expect(serialized).toContain('"arr":[true,false,null,9007199254740993]');
    expect(comparisonScalarsEqual(new ExactJsonNumber('9007199254740993'), '9007199254740993')).toBe(false);
    expect(compareJsonTexts('{"toString":1}', '{}').diffs[0].rightPreview).toBe('');
    expect(compareJsonTexts('null', '{}').diffs).toHaveLength(1);
  });
  it.each(['', ' ', '01', '1.', '1e', '[1,]', '{"x":1,}', '{"x":9007199254740993,}', '"unclosed', 'NaN'])(
    'rejects invalid JSON: %s',
    (text) => {
      expect(() => parseComparisonJson(text)).toThrow();
      expect(compareJsonTexts(text, text).leftError).not.toBeNull();
    }
  );
  it('handles 10000 nested arrays and objects without recursive parse, compare or serialization', () => {
    for (const [open, close, segment] of [
      ['[', ']', 0],
      ['{"v":', '}', 'v'],
    ] as const) {
      const left = open.repeat(10000) + '9007199254740993' + close.repeat(10000);
      const right = open.repeat(10000) + '9007199254740994' + close.repeat(10000);
      const comparison = createJsonComparison(left, right);
      const result = comparison.next();
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0].path).toEqual(Array(10000).fill(segment));
      expect(comparison.readValue([], 'left', 0, true).text).toBe(left);
      expect(compareJsonTexts(left, ' ' + left).diffs).toHaveLength(0);
    }
  });
  it('reads every long value section and full values after completing comparison', () => {
    const long = '你好🌍'.repeat(10000);
    const comparison = createJsonComparison(
      JSON.stringify({ message: long + 'A' }),
      JSON.stringify({ message: long + 'B' })
    );
    const result = comparison.next();
    expect(result.diffs[0].leftPreview).toBe(result.diffs[0].rightPreview);
    expect(result.diffs[0].leftPreview).toHaveLength(120);
    const sections: string[] = [];
    let total = Infinity;
    for (let offset = 0; offset < total; offset += DIFF_VALUE_CHUNK_SIZE) {
      const value = comparison.readValue(['message'], 'left', offset);
      expect(value.text.length).toBeLessThanOrEqual(DIFF_VALUE_CHUNK_SIZE + 1);
      expect(new TextDecoder().decode(new TextEncoder().encode(value.text))).toBe(value.text);
      total = value.total;
      sections.push(value.text);
    }
    expect(sections.join('')).toBe(JSON.stringify(long + 'A'));
    expect(comparison.readValue(['message'], 'right', 0, true).text).toBe(JSON.stringify(long + 'B'));
    expect(comparison.readValue(['absent'], 'left').missing).toBe(true);
    expect(comparison.readValue(['message'], 'left', -5).offset).toBe(0);
    expect(comparison.readValue(['message'], 'left', Infinity).text).toBe('');
    expect(normalizeJsonNumber('123.45000e+2')).toBe('12345e0');
  });
  it('serializes compound values without losing precision or quoting numbers', () => {
    const source = '{"list":[1e400,9007199254740993,{"b":true,"n":null}],"s":"hello\\nworld"}';
    expect(serializeComparisonValue(parseComparisonJson(source))).toBe(source);
    const comparison = createJsonComparison('{}', '{"added":' + source + '}');
    expect(comparison.next().diffs[0].rightPreview.length).toBeLessThanOrEqual(120);
    expect(comparison.readValue(['added'], 'right', 0, true).text).toBe(source);
    expect(createJsonComparison(source, source).readValue([], 'left', 0, true).text).toBe(source);
  });
});
