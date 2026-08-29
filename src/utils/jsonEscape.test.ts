// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  escapeJsonStringLiteral,
  escapeJsonText,
  looksLikeEscapedJson,
  unescapeJsonStringLiteral,
  unescapeJsonText,
} from './jsonEscape';

describe('jsonEscape', () => {
  it('decodes a JSON string literal without classifying the decoded payload', () => {
    expect(unescapeJsonStringLiteral('"{\\"value\\":1}"')).toBe('{"value":1}');
  });

  it('unescapes a JSON string literal without changing its layout', () => {
    expect(unescapeJsonText('"{\\"id\\":1,\\"name\\":\\"test\\"}"')).toEqual({
      text: '{"id":1,"name":"test"}',
      formattedJson: true,
    });
  });

  it('unescapes bare escaped JSON without changing its layout', () => {
    expect(unescapeJsonText('{\\"id\\":1,\\"name\\":\\"test\\"}')).toEqual({
      text: '{"id":1,"name":"test"}',
      formattedJson: true,
    });
  });

  it('unescapes ordinary JSON string literals without forcing JSON formatting', () => {
    expect(unescapeJsonText('"hello\\nworld"')).toEqual({
      text: 'hello\nworld',
      formattedJson: false,
    });
  });

  it('escapes valid JSON as an embeddable JSON string literal', () => {
    expect(escapeJsonText('{"id":1,"name":"test"}')).toEqual({
      text: '"{\\"id\\":1,\\"name\\":\\"test\\"}"',
      formattedJson: true,
    });
  });

  it.each(['{"id":1,"name":"test"}', '{\n  "id": 1,\n  "name": "test"\n}', '  [1, 2, 3]\n'])(
    'round-trips JSON without changing whitespace: %j',
    (source) => {
      expect(unescapeJsonText(escapeJsonText(source).text).text).toBe(source);
    }
  );

  it('escapes plain text as a JSON string', () => {
    expect(escapeJsonText('hello')).toEqual({
      text: '"hello"',
      formattedJson: false,
    });
  });

  it('escapes repeated large string literals without reparsing their decoded contents', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    const source = `[{"message":"${'x'.repeat(1024 * 1024)}"}]`;

    const once = escapeJsonStringLiteral(source);
    const twice = escapeJsonStringLiteral(once);

    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
    expect(JSON.parse(JSON.parse(twice))).toBe(source);
  });

  it('detects escaped JSON but not ordinary JSON', () => {
    expect(looksLikeEscapedJson('{\\"id\\":1}')).toBe(true);
    expect(looksLikeEscapedJson('{"id":1}')).toBe(false);
  });
});
