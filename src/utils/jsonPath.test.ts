// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatJsonPath } from './jsonPath';

describe('jsonPath', () => {
  it('formats root and simple object paths', () => {
    expect(formatJsonPath([])).toBe('$');
    expect(formatJsonPath(['items', 2, 'requestId'])).toBe('$.items[2].requestId');
  });

  it('uses bracket notation for keys that cannot use dot notation', () => {
    expect(formatJsonPath(['foo-bar', '0', 'quote"key', 'path\\key'])).toBe(
      '$["foo-bar"]["0"]["quote\\"key"]["path\\\\key"]'
    );
  });
});
