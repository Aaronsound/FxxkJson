import { describe, expect, it } from 'vitest';
import { compareJsonTexts } from './jsonDiff';

describe('comparison duplicate key safety', () => {
  it.each([
    ['{"status":1,"status":2}', '{"status":2}', 'status', undefined],
    ['{}', '{"nested":{"":0,"":1}}', undefined, ''],
    ['{"a":1,"\\u0061":2}', '{"b":1,"b":2}', 'a', 'b'],
    ['{"a":1,"a":2}', '{"a":1,"a":2}', 'a', 'a'],
  ])('blocks ambiguous structural comparison without changing input', (left, right, leftKey, rightKey) => {
    expect(compareJsonTexts(left, right)).toMatchObject({
      diffs: [],
      truncated: false,
      leftDuplicateKey: leftKey,
      rightDuplicateKey: rightKey,
    });
  });
  it('allows the same key in separate objects and still reports precise differences', () => {
    expect(compareJsonTexts('[{"id":1},{"id":2}]', '[{"id":1},{"id":3}]').diffs).toHaveLength(1);
    expect(compareJsonTexts('{"id":9007199254740993}', '{"id":9007199254740994}').diffs).toHaveLength(1);
  });
  it('keeps syntax errors distinct from duplicate warnings', () => {
    expect(compareJsonTexts('{"a":1,"a":', '{}').leftError).toBeTruthy();
  });
});
