// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isJsonEditPath, parseEditableNodePayload } from './jsonEditNodePayload';

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
});
