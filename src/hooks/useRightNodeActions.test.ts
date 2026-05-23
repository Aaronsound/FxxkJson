import { describe, expect, it } from 'vitest';
import { getJsonValueClipboardText } from './useRightNodeActions';

describe('getJsonValueClipboardText', () => {
  it('copies string values without JSON quotes', () => {
    expect(getJsonValueClipboardText('"alpha"')).toBe('alpha');
    expect(getJsonValueClipboardText('"line\\nbreak"')).toBe('line\nbreak');
  });

  it('keeps non-string values as JSON literals', () => {
    expect(getJsonValueClipboardText('{"ok":true}')).toBe('{"ok":true}');
    expect(getJsonValueClipboardText('[1,2]')).toBe('[1,2]');
    expect(getJsonValueClipboardText('42')).toBe('42');
    expect(getJsonValueClipboardText('null')).toBe('null');
  });
});
