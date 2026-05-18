// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addRecentSearchTerm,
  upsertPinnedPath,
} from './searchQuickAccess';

describe('searchQuickAccess', () => {
  it('keeps recent searches unique and newest first', () => {
    expect(addRecentSearchTerm(['traceId', 'request'], 'request', 3)).toEqual([
      'request',
      'traceId',
    ]);
    expect(addRecentSearchTerm(['traceId', 'request'], 'status', 2)).toEqual([
      'status',
      'traceId',
    ]);
  });

  it('ignores tiny recent search terms', () => {
    expect(addRecentSearchTerm(['request'], ' r ', 5)).toEqual(['request']);
  });

  it('deduplicates pinned paths by JSON Path', () => {
    const first = {
      id: 'first',
      pathText: '$.items[0].requestId',
      startOffset: 10,
      endOffset: 18,
      createdAt: 1,
    };
    const second = {
      ...first,
      id: 'second',
      startOffset: 24,
      endOffset: 32,
      createdAt: 2,
    };

    expect(upsertPinnedPath([first], second, 5)).toEqual([second]);
  });
});
