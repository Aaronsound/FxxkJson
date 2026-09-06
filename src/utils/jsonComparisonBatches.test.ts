import { describe, expect, it } from 'vitest';
import { createComparisonBatches } from './jsonComparisonBatches';
import type { JsonDiffEntry } from './jsonDiff';

describe('comparison batch storage', () => {
  it('filters all loaded pages without dropping unloaded state or changing stored batches', () => {
    const store = createComparisonBatches();
    const diffs: JsonDiffEntry[] = Array.from({ length: 4001 }, (_, index) => ({
      type: index % 2 ? 'added' : 'changed',
      path: ['orders', index],
      pathText: `$.orders[${index}]`,
      leftPreview: '0',
      rightPreview: '1',
    }));
    for (let start = 0; start < diffs.length; start += 2000)
      store.append({ diffs: diffs.slice(start, start + 2000), leftError: null, rightError: null, truncated: true });
    const selected = store.filter('changed', 'orders');
    expect(selected.total).toBe(2001);
    expect(selected.pages[1][0]).toBe(diffs[4000]);
    expect(store.filter('all', '').total).toBe(4001);
    expect(store.filter('all', 'Orders').total).toBe(0);
    expect(store.filter('removed', '').total).toBe(0);
    expect(store.page(0)?.[0]).toBe(diffs[0]);
  });
  it('retains batch identity, counts only new entries and keeps old snapshots immutable', () => {
    const store = createComparisonBatches();
    let reads = 0;
    const first: JsonDiffEntry[] = [
      {
        get type() {
          reads += 1;
          return 'added' as const;
        },
        path: ['a'],
        pathText: '$.a',
        leftPreview: '',
        rightPreview: '1',
      },
    ];
    const before = store.append({ diffs: first, leftError: null, rightError: null, truncated: true });
    for (let page = 1; page < 100; page++) {
      store.append({
        diffs: [{ type: 'changed', path: [page], pathText: `$[${page}]`, leftPreview: '0', rightPreview: '1' }],
        leftError: null,
        rightError: null,
        truncated: true,
      });
    }
    const last = store.append({ diffs: [], leftError: null, rightError: null, truncated: false });
    expect(reads).toBe(1);
    expect(store.page(0)).toBe(first);
    expect(store.page(100)).toBeUndefined();
    expect(before).toMatchObject({
      total: 1,
      pageCount: 1,
      counts: { added: 1, removed: 0, changed: 0 },
      truncated: true,
    });
    expect(last).toMatchObject({
      total: 100,
      pageCount: 100,
      counts: { added: 1, removed: 0, changed: 99 },
      truncated: false,
    });
    expect(createComparisonBatches().page(0)).toBeUndefined();
  });
  it('preserves parse errors without adding empty pages', () => {
    expect(
      createComparisonBatches().append({ diffs: [], leftError: 'invalid', rightError: null, truncated: false })
    ).toMatchObject({ total: 0, pageCount: 0, leftError: 'invalid' });
  });
});
