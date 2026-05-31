// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { escapeJsonText, looksLikeEscapedJson, unescapeJsonText } from './jsonEscape';

describe('jsonEscape', () => {
  it('unescapes and formats a JSON string literal', () => {
    expect(unescapeJsonText('"{\\"id\\":1,\\"name\\":\\"test\\"}"')).toEqual({
      text: JSON.stringify({ id: 1, name: 'test' }, null, 2),
      formattedJson: true,
    });
  });

  it('unescapes and formats bare escaped JSON', () => {
    expect(unescapeJsonText('{\\"id\\":1,\\"name\\":\\"test\\"}')).toEqual({
      text: JSON.stringify({ id: 1, name: 'test' }, null, 2),
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

  it('escapes plain text as a JSON string', () => {
    expect(escapeJsonText('hello')).toEqual({
      text: '"hello"',
      formattedJson: false,
    });
  });

  it('detects escaped JSON but not ordinary JSON', () => {
    expect(looksLikeEscapedJson('{\\"id\\":1}')).toBe(true);
    expect(looksLikeEscapedJson('{"id":1}')).toBe(false);
  });
});
