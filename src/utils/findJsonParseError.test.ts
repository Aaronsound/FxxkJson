import { describe, expect, it } from 'vitest';
import { findJsonParseError } from './findJsonParseError';
import { getErrorHighlightRange } from './jsonErrorLocation';

describe('JSON error location', () => {
  it.each(['\n', '\r\n', '\r'])('locates missing commas with %j line endings', (newline) => {
    const text = ['{', '  "name": "中文🌍"', '  "value": 1', '}'].join(newline);
    expect(findJsonParseError(text, 4)).toMatchObject({
      offset: text.indexOf('"value"'),
      line: 3,
      column: 3,
      rawRevision: 4,
    });
  });
  it.each(['{"x":1,}', '[1,]', '{"x":}', '{"x" 1}', '{"x":"\\uZZZZ"}', '//comment\n{}', '{} {}'])(
    'finds strict JSON errors in %s',
    (text) => {
      const error = findJsonParseError(text, 2);
      expect(error).toBeDefined();
      expect(error?.offset).toBeLessThanOrEqual(text.length);
      expect(error?.line).toBeGreaterThanOrEqual(1);
    }
  );
  it('handles EOF, empty input, UTF-16 columns and surrogate-safe marking', () => {
    const text = '{"x":"🌍"';
    expect(findJsonParseError(text, 1)).toMatchObject({ offset: text.length, line: 1, column: text.length + 1 });
    const eof = findJsonParseError('', 0);
    if (!eof) throw new Error('Expected EOF location');
    expect(eof).toMatchObject({ offset: 0, line: 1, column: 1 });
    expect(getErrorHighlightRange('', eof)).toEqual({ start: 0, end: 0 });
    expect(getErrorHighlightRange('🌍', { ...eof, offset: 2 })).toEqual({ start: 0, end: 2 });
    expect(getErrorHighlightRange('🌍', { ...eof, offset: 1, length: 1 })).toEqual({ start: 0, end: 2 });
    expect(getErrorHighlightRange('🌍', { ...eof, offset: 0, length: 1 })).toEqual({ start: 0, end: 2 });
    expect(getErrorHighlightRange('x'.repeat(1000), { ...eof, offset: 5, length: 900 })).toEqual({ start: 5, end: 85 });
  });
  it('returns no location for valid JSON and handles errors at the tail of 20MB text', () => {
    expect(findJsonParseError('{"x":"🌍","nested":[1,true,null]}', 1)).toBeUndefined();
    const text = `{"payload":"${'x'.repeat(20 * 1024 * 1024)}","bad":}`;
    expect(findJsonParseError(text, 9)).toMatchObject({ offset: text.length - 1, column: text.length, rawRevision: 9 });
  });
});
