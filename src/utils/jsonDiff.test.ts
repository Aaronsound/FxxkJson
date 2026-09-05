// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { compareJsonTexts, createJsonComparison } from './jsonDiff';

describe('compareJsonTexts', () => {
  it.each([2000, 2001, 4000, 5000, 10001])(
    'resumes until all %i differences are returned without gaps or duplicates',
    (count) => {
      const comparison = createJsonComparison(
        JSON.stringify(Array(count).fill(0)),
        JSON.stringify(Array(count).fill(1))
      );
      const paths: string[] = [];
      let more = true;
      while (more) {
        const batch = comparison.next();
        expect(batch.diffs.length).toBeLessThanOrEqual(2000);
        expect(batch.diffs.length).toBeGreaterThan(0);
        paths.push(...batch.diffs.map((diff) => diff.pathText));
        more = batch.truncated;
      }
      expect(paths).toEqual(Array.from({ length: count }, (_, index) => `$[${index}]`));
      expect(comparison.next()).toEqual({ diffs: [], leftError: null, rightError: null, truncated: false });
    }
  );

  it('parses only once and keeps mixed nested differences across a batch boundary', () => {
    const parse = vi.spyOn(JSON, 'parse');
    try {
      const left = { a: Array(1999).fill(0), nested: { removed: true, same: 3, value: 1 }, z: 'left' };
      const right = { a: Array(1999).fill(1), nested: { added: true, same: 3, value: 2 }, z: 'right' };
      const comparison = createJsonComparison(JSON.stringify(left), JSON.stringify(right));
      expect(parse).toHaveBeenCalledTimes(2);
      const first = comparison.next();
      const second = comparison.next();
      expect(first.diffs.at(-1)?.pathText).toBe('$.nested.added');
      expect(second.diffs.map((diff) => [diff.type, diff.pathText])).toEqual([
        ['removed', '$.nested.removed'],
        ['changed', '$.nested.value'],
        ['changed', '$.z'],
      ]);
      expect(second.truncated).toBe(false);
      expect(parse).toHaveBeenCalledTimes(2);
    } finally {
      parse.mockRestore();
    }
  });
  it.each([1999, 2000, 2001, 2100])('reports truncation accurately with %i differences', (count) => {
    const result = compareJsonTexts(JSON.stringify(Array(count).fill(0)), JSON.stringify(Array(count).fill(1)));
    expect(result.diffs).toHaveLength(Math.min(2000, count));
    expect(result.truncated).toBe(count > 2000);
  });

  it('does not report truncation when equal values follow exactly 2000 differences', () => {
    const result = compareJsonTexts(
      JSON.stringify([...Array(2000).fill(0), 2]),
      JSON.stringify([...Array(2000).fill(1), 2])
    );
    expect(result.diffs).toHaveLength(2000);
    expect(result.truncated).toBe(false);
  });
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
