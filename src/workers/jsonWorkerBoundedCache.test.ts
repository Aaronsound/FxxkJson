import { describe, expect, it, vi } from 'vitest';
import { BoundedLruMap } from './jsonWorkerBoundedCache';

describe('BoundedLruMap', () => {
  it('evicts the least recently used entry when the limit is exceeded', () => {
    const onEvict = vi.fn();
    const cache = new BoundedLruMap<string, number>({ maxEntries: 2, onEvict });
    cache.set('tab-a', 1);
    cache.set('tab-b', 2);
    expect(cache.get('tab-a')).toBe(1);

    cache.set('tab-c', 3);

    expect([...cache.keys()]).toEqual(['tab-a', 'tab-c']);
    expect(onEvict).toHaveBeenCalledWith('tab-b', 2);
  });

  it('does not report explicit deletion or replacement as eviction', () => {
    const onEvict = vi.fn();
    const cache = new BoundedLruMap<string, number>({ maxEntries: 2, onEvict });
    cache.set('tab-a', 1);
    cache.set('tab-a', 2);
    cache.delete('tab-a');

    expect(onEvict).not.toHaveBeenCalled();
  });
});
