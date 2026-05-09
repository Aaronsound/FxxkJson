import { describe, expect, it } from 'vitest';
import { saveJsonPreservingOriginalFormat } from './preserveJsonFormat';

describe('preserveJsonFormat', () => {
  it('keeps a compact raw JSON document compact after editing a field', () => {
    const original = '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}';
    const edited = JSON.stringify({
      items: [
        { id: 1, name: 'alpha' },
        { id: 2, name: 'changed' },
      ],
    }, null, 2);

    expect(saveJsonPreservingOriginalFormat(original, edited)).toBe(
      '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"changed"}]}'
    );
  });

  it('keeps the original indentation style for multiline documents', () => {
    const original = [
      '{',
      '    "name": "alpha",',
      '    "nested": {',
      '        "ok": true',
      '    }',
      '}',
      '',
    ].join('\n');
    const edited = JSON.stringify({
      name: 'beta',
      nested: {
        ok: true,
      },
    }, null, 2);

    expect(saveJsonPreservingOriginalFormat(original, edited)).toBe([
      '{',
      '    "name": "beta",',
      '    "nested": {',
      '        "ok": true',
      '    }',
      '}',
      '',
    ].join('\n'));
  });

  it('falls back to compact serialization for structural edits in compact JSON', () => {
    const original = '{"name":"alpha"}';
    const edited = JSON.stringify({
      name: 'alpha',
      active: true,
    }, null, 2);

    expect(saveJsonPreservingOriginalFormat(original, edited)).toBe('{"name":"alpha","active":true}');
  });
});
