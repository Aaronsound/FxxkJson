// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  getJsonLiteralDetails,
  isJsonEditPath,
  parseEditableNodeDetails,
  parseEditableNodePayload,
} from './jsonEditNodePayload';

describe('jsonEditNodePayload', () => {
  it('parses editable node payloads from the worker', () => {
    expect(
      parseEditableNodePayload(
        JSON.stringify({
          path: ['items', 0, 'requestId'],
          value: '"req-0001"',
        })
      )
    ).toEqual({
      path: ['items', 0, 'requestId'],
      value: '"req-0001"',
    });
  });

  it('rejects invalid paths and values', () => {
    expect(isJsonEditPath(['items', 0])).toBe(true);
    expect(isJsonEditPath(['items', null])).toBe(false);

    expect(() =>
      parseEditableNodePayload(
        JSON.stringify({
          path: ['items', null],
          value: '"req-0001"',
        }),
        'bad node'
      )
    ).toThrow('bad node');

    expect(() =>
      parseEditableNodePayload(
        JSON.stringify({
          path: ['items', 0],
          value: 1,
        }),
        'bad node'
      )
    ).toThrow('bad node');
  });

  it('derives clipboard text and JSON renderings from node literals', () => {
    expect(getJsonLiteralDetails('"alpha"')).toMatchObject({
      clipboardValue: 'alpha',
      compactJson: '"alpha"',
      formattedJson: '"alpha"',
      kind: 'string',
    });
    expect(getJsonLiteralDetails('{"ok":true}')).toMatchObject({
      clipboardValue: '{"ok":true}',
      compactJson: '{"ok":true}',
      formattedJson: '{\n  "ok": true\n}',
      kind: 'object',
    });
  });

  it('parses editable node payloads with copy details', () => {
    expect(
      parseEditableNodeDetails(
        JSON.stringify({
          path: ['items', 0, 'name'],
          value: '"demo"',
        })
      )
    ).toMatchObject({
      clipboardValue: 'demo',
      kind: 'string',
      path: ['items', 0, 'name'],
      value: '"demo"',
    });
  });
});
