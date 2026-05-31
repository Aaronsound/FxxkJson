// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatJsonText, repairJsonText } from './jsonFormat';

describe('jsonFormat', () => {
  it('formats regular JSON objects', () => {
    expect(formatJsonText('{"ok":true}')).toEqual({
      formatted: '{\n  "ok": true\n}',
      normalizedNestedString: false,
    });
  });

  it('formats a root JSON string when that string contains an object', () => {
    const inner = JSON.stringify({
      pkgSpec: {
        id: 802716208,
        name: 'nested package',
      },
      message: 'line 1\nline 2',
    });
    const copiedDataValue = JSON.stringify(inner);

    expect(formatJsonText(copiedDataValue)).toEqual({
      formatted: JSON.stringify(JSON.parse(inner), null, 2),
      normalizedNestedString: true,
    });
  });

  it('keeps ordinary root strings as JSON strings', () => {
    expect(formatJsonText('"plain text"')).toEqual({
      formatted: '"plain text"',
      normalizedNestedString: false,
    });
  });

  it('keeps root strings when their contents only look like JSON', () => {
    expect(formatJsonText('"{not valid json}"')).toEqual({
      formatted: '"{not valid json}"',
      normalizedNestedString: false,
    });
  });

  it('does not auto-repair during regular formatting', () => {
    expect(() => formatJsonText('{ok: true,}')).toThrow();
  });

  it('repairs common invalid JSON before formatting', () => {
    expect(repairJsonText('{ok: true,}')).toEqual({
      repaired: '{"ok": true}',
      formatted: '{\n  "ok": true\n}',
      normalizedNestedString: false,
    });
  });
});
