// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteJsonNodePreservingOriginalFormat,
  renameJsonObjectKeyPreservingOriginalFormat,
  saveJsonNodePreservingOriginalFormat,
  saveJsonPreservingOriginalFormat,
} from './preserveJsonFormat';

describe('preserveJsonFormat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a compact raw JSON document compact after editing a field', () => {
    const original = '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}';
    const edited = JSON.stringify(
      {
        items: [
          { id: 1, name: 'alpha' },
          { id: 2, name: 'changed' },
        ],
      },
      null,
      2
    );

    expect(saveJsonPreservingOriginalFormat(original, edited)).toBe(
      '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"changed"}]}'
    );
  });

  it('skips parsing the original document for compact JSON saves', () => {
    const original = '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}';
    const edited = JSON.stringify(
      {
        items: [
          { id: 1, name: 'alpha' },
          { id: 2, name: 'changed' },
        ],
      },
      null,
      2
    );
    const parseSpy = vi.spyOn(JSON, 'parse');

    expect(saveJsonPreservingOriginalFormat(original, edited)).toBe(
      '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"changed"}]}'
    );
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledWith(edited);
  });

  it('keeps the original indentation style for multiline documents', () => {
    const original = ['{', '    "name": "alpha",', '    "nested": {', '        "ok": true', '    }', '}', ''].join(
      '\n'
    );
    const edited = JSON.stringify(
      {
        name: 'beta',
        nested: {
          ok: true,
        },
      },
      null,
      2
    );

    expect(saveJsonPreservingOriginalFormat(original, edited)).toBe(
      ['{', '    "name": "beta",', '    "nested": {', '        "ok": true', '    }', '}', ''].join('\n')
    );
  });

  it('reuses a cached original value for multiline document saves', () => {
    const original = ['{', '    "name": "alpha",', '    "nested": {', '        "ok": true', '    }', '}'].join('\n');
    const originalValue = {
      name: 'alpha',
      nested: {
        ok: true,
      },
    };
    const edited = JSON.stringify(
      {
        name: 'beta',
        nested: {
          ok: true,
        },
      },
      null,
      2
    );
    const parseSpy = vi.spyOn(JSON, 'parse');

    expect(saveJsonPreservingOriginalFormat(original, edited, { originalValue })).toBe(
      ['{', '    "name": "beta",', '    "nested": {', '        "ok": true', '    }', '}'].join('\n')
    );
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledWith(edited);
  });

  it('falls back to compact serialization for structural edits in compact JSON', () => {
    const original = '{"name":"alpha"}';
    const edited = JSON.stringify(
      {
        name: 'alpha',
        active: true,
      },
      null,
      2
    );

    expect(saveJsonPreservingOriginalFormat(original, edited)).toBe('{"name":"alpha","active":true}');
  });

  it('updates a compact nested node without formatting the whole document', () => {
    const original = '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}';

    expect(saveJsonNodePreservingOriginalFormat(original, ['items', 1, 'name'], '"changed"')).toBe(
      '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"changed"}]}'
    );
  });

  it('uses a known node range for scalar node saves', () => {
    const original = '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}';
    const startOffset = original.indexOf('"beta"');

    expect(
      saveJsonNodePreservingOriginalFormat(original, ['items', 1, 'name'], '"changed"', {
        range: { startOffset, endOffset: startOffset + '"beta"'.length },
      })
    ).toBe('{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"changed"}]}');
  });

  it('falls back to path editing when a provided node range is stale', () => {
    const original = '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}';

    expect(
      saveJsonNodePreservingOriginalFormat(original, ['items', 1, 'name'], '"changed"', {
        range: { startOffset: 0, endOffset: 1 },
      })
    ).toBe('{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"changed"}]}');
  });

  it('updates a multiline nested node with the original indentation style', () => {
    const original = ['{', '    "name": "alpha",', '    "nested": {', '        "ok": true', '    }', '}', ''].join(
      '\n'
    );

    expect(saveJsonNodePreservingOriginalFormat(original, ['nested', 'ok'], 'false')).toBe(
      ['{', '    "name": "alpha",', '    "nested": {', '        "ok": false', '    }', '}', ''].join('\n')
    );
  });

  it('deletes a compact nested object key', () => {
    const original = '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}';

    expect(deleteJsonNodePreservingOriginalFormat(original, ['items', 1, 'name'])).toBe(
      '{"items":[{"id":1,"name":"alpha"},{"id":2}]}'
    );
  });

  it('renames a compact object key and keeps the value', () => {
    const original = '{"items":[{"requestId":"req-1","name":"alpha"}]}';

    expect(renameJsonObjectKeyPreservingOriginalFormat(original, ['items', 0, 'requestId'], 'traceId')).toBe(
      '{"items":[{"name":"alpha","traceId":"req-1"}]}'
    );
  });

  it('rejects duplicate key names while renaming', () => {
    const original = '{"name":"alpha","traceId":"req-1"}';

    expect(() => renameJsonObjectKeyPreservingOriginalFormat(original, ['name'], 'traceId')).toThrow('新的 key 已存在');
  });
});
