// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareJsonTexts } from './jsonDiff';

describe('compareJsonTexts', () => {
  it('reports added, removed, and changed JSON paths', () => {
    const result = compareJsonTexts(
      JSON.stringify({
        id: 1,
        name: 'left',
        stale: true,
        items: [{ value: 1 }, { value: 2 }],
      }),
      JSON.stringify({
        id: 1,
        name: 'right',
        items: [{ value: 1 }, { value: 3 }, { value: 4 }],
        extra: false,
      })
    );

    expect(result.leftError).toBeNull();
    expect(result.rightError).toBeNull();
    expect(result.diffs.map((diff) => `${diff.type}:${diff.pathText}`)).toEqual([
      'added:$.extra',
      'changed:$.items[1].value',
      'added:$.items[2]',
      'changed:$.name',
      'removed:$.stale',
    ]);
  });

  it('returns parse errors without throwing', () => {
    const result = compareJsonTexts('{', '{"ok":true}');

    expect(result.diffs).toEqual([]);
    expect(result.leftError).toContain('Expected property name');
    expect(result.rightError).toBeNull();
  });
});
