// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  areJsonPathsEqual,
  createNodeEditCacheEntry,
  getCachedNodeRange,
} from './jsonNodeEditCache';

describe('jsonNodeEditCache', () => {
  it('compares JSON paths by segment value', () => {
    expect(areJsonPathsEqual(['items', 1, 'name'], ['items', 1, 'name'])).toBe(true);
    expect(areJsonPathsEqual(['items', '1'], ['items', 1])).toBe(false);
  });

  it('returns cached formatted and raw ranges when source text still matches', () => {
    const cache = new Map();
    cache.set('tab-1', createNodeEditCacheEntry({
      formattedText: '{\n  "name": "alpha"\n}',
      path: ['name'],
      formattedNode: { offset: 12, length: 7 },
      rawNode: { offset: 8, length: 7 },
      rawTextLength: '{"name":"alpha"}'.length,
    }));

    expect(getCachedNodeRange(cache, 'tab-1', ['name'], 'formatted', '{\n  "name": "alpha"\n}')).toEqual({
      startOffset: 12,
      endOffset: 19,
    });
    expect(getCachedNodeRange(cache, 'tab-1', ['name'], 'raw', '{"name":"alpha"}')).toEqual({
      startOffset: 8,
      endOffset: 15,
    });
  });

  it('ignores stale ranges', () => {
    const cache = new Map();
    cache.set('tab-1', createNodeEditCacheEntry({
      formattedText: '{"name":"alpha"}',
      path: ['name'],
      formattedNode: { offset: 8, length: 7 },
      rawTextLength: '{"name":"alpha"}'.length,
    }));

    expect(getCachedNodeRange(cache, 'tab-1', ['name'], 'formatted', '{"name":"beta"}')).toBeUndefined();
    expect(getCachedNodeRange(cache, 'tab-1', ['other'], 'formatted', '{"name":"alpha"}')).toBeUndefined();
    expect(getCachedNodeRange(cache, 'tab-1', ['name'], 'raw', '{"name":"alpha","x":1}')).toBeUndefined();
  });
});
