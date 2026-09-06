// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compactJsonText, findDuplicateJsonKey, findDuplicateJsonKeyAsync, layoutJsonTokens } from './losslessJson';
import { formatJsonText, repairJsonText } from './jsonFormat';
import {
  deleteJsonNodePreservingOriginalFormat,
  renameJsonObjectKeyPreservingOriginalFormat,
  saveJsonNodePreservingOriginalFormat,
  saveJsonPreservingOriginalFormat,
} from './preserveJsonFormat';
import { getJsonLiteralDetails } from './jsonEditNodePayload';

const raw =
  '{"id":9007199254740993,"n":0.1234567890123456789,"huge":1e400,"tiny":1e-400,"zero":-0,"status":1,"status":2,"name":"before"}';
describe('lossless JSON workflows', () => {
  it('preserves exact number tokens and duplicate members through formatting, compaction and repair', () => {
    expect(compactJsonText(formatJsonText(raw).formatted)).toBe(raw);
    expect(compactJsonText(repairJsonText(raw.slice(0, -1) + ',}').formatted)).toBe(raw);
    expect(compactJsonText(formatJsonText(JSON.stringify(raw)).formatted)).toBe(raw);
    expect(getJsonLiteralDetails(raw).compactJson).toBe(raw);
    expect(compactJsonText(getJsonLiteralDetails(raw).formattedJson)).toBe(raw);
  });
  it('preserves unrelated precise values when editing full compact and multiline documents', () => {
    const edited = formatJsonText(raw).formatted.replace('before', 'after');
    expect(saveJsonPreservingOriginalFormat(raw, edited)).toBe(raw.replace('before', 'after'));
    const multiline = layoutJsonTokens(raw, '\t', '\r\n') + '\r\n';
    expect(saveJsonPreservingOriginalFormat(multiline, edited)).toBe(multiline.replace('before', 'after'));
    expect(saveJsonPreservingOriginalFormat(multiline, edited.replace('9007199254740993', '9007199254740995'))).toBe(
      multiline.replace('before', 'after').replace('9007199254740993', '9007199254740995')
    );
  });
  it('never serializes neighboring values during node changes, deletion and renaming', () => {
    const source = '{"id":9007199254740993,"name":"old","nested":{"n":1e400}}';
    expect(saveJsonNodePreservingOriginalFormat(source, ['id'], '9007199254740995')).toBe(source.replace('993', '995'));
    expect(deleteJsonNodePreservingOriginalFormat(source, ['name'])).toBe(
      '{"id":9007199254740993,"nested":{"n":1e400}}'
    );
    expect(renameJsonObjectKeyPreservingOriginalFormat(source, ['nested'], 'data')).toBe(
      source.replace('nested', 'data')
    );
    expect(saveJsonNodePreservingOriginalFormat(source, ['nested'], '{"a":1,"a":2}')).toContain(
      '"nested":{"a":1,"a":2}'
    );
  });
  it.each([
    '{}',
    '[]',
    'null',
    '-0',
    '1e400',
    '"plain"',
    '{"text":"中文😀 \\n \\t \\\" \\\\"}',
    '{"x":{},"a":[[],{},true,false,null]}',
    ' {\r\n"a": 1, "b": [2,3]\r\n} ',
  ])('keeps values and layout stable: %s', (text) => {
    const formatted = layoutJsonTokens(text);
    expect(JSON.parse(formatted)).toEqual(JSON.parse(text));
    expect(layoutJsonTokens(formatted)).toBe(formatted);
    expect(compactJsonText(formatted)).toBe(compactJsonText(text));
  });
  it('preserves escaped and literal lone surrogates', () => {
    for (const text of ['"\\ud800"', '"\ud800"', '"\udc00"', '"😀\ud800"']) {
      expect(JSON.parse(layoutJsonTokens(text))).toBe(JSON.parse(text));
    }
  });
  it('grows output buffers without truncation and uses iterative deep layout', () => {
    const deep = '['.repeat(300) + '9007199254740993' + ']'.repeat(300);
    expect(compactJsonText(formatJsonText(deep).formatted)).toBe(deep);
  });
  it('handles long escaped strings without a recursive regular expression', () => {
    const text = '{"payload":' + JSON.stringify('\\"'.repeat(500000)) + ',"a":1,"a":2}';
    expect(compactJsonText(formatJsonText(text).formatted)).toBe(text);
    expect(findDuplicateJsonKey(text)?.key).toBe('a');
  });
  it.each(['ASCII', '中文😀', '\ud800'])('keeps quote offsets exact for %s input', (prefix) => {
    const value = prefix + '\\"'.repeat(1000) + '\\';
    const text = JSON.stringify({ value, after: [value, { done: true }] });
    const expected = JSON.stringify(JSON.parse(text), null, 2);
    expect(layoutJsonTokens(text)).toBe(expected);
    expect(compactJsonText(expected)).toBe(text);
  });
  it('detects escaped-equivalent keys but not keys in independent objects or string contents', async () => {
    expect(findDuplicateJsonKey('[{"a":1},{"a":2}]')).toBeNull();
    const text = '{"a":1,"\\u0061":2}';
    expect(findDuplicateJsonKey(text)).toEqual({ key: 'a', offset: 7 });
    expect(await findDuplicateJsonKeyAsync(text, () => true)).toEqual({ key: 'a', offset: 7 });
    expect(
      await findDuplicateJsonKeyAsync(JSON.stringify(Array.from({ length: 3000 }, () => ({ a: 1 }))), () => false)
    ).toBeNull();
  });
  it.each(['{"a":1,}', '{"x":01}', '{"x":NaN}', '[1 2]', '"unterminated'])(
    'does not silently repair invalid text %s',
    (text) => {
      expect(() => formatJsonText(text)).toThrow(SyntaxError);
      expect(() => compactJsonText(text)).toThrow(SyntaxError);
    }
  );
});
