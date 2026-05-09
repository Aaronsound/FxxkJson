import { describe, expect, it } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import {
  buildLineStarts,
  findTextSearchBatch,
} from './searchText';

describe('searchText', () => {
  it('loads complete search results across multiple batches', () => {
    const text = Array.from({ length: 5 }, (_, index) => `HanJson item ${index}`).join('\n');
    const lineStarts = buildLineStarts(text);

    const firstBatch = findTextSearchBatch(
      text,
      lineStarts,
      lineStarts.length,
      'HanJson',
      DEFAULT_SEARCH_OPTIONS,
      0,
      2
    );

    const secondBatch = findTextSearchBatch(
      text,
      lineStarts,
      lineStarts.length,
      'HanJson',
      DEFAULT_SEARCH_OPTIONS,
      firstBatch.nextStartOffset,
      2
    );

    const thirdBatch = findTextSearchBatch(
      text,
      lineStarts,
      lineStarts.length,
      'HanJson',
      DEFAULT_SEARCH_OPTIONS,
      secondBatch.nextStartOffset,
      2
    );

    expect(firstBatch.matches).toHaveLength(2);
    expect(firstBatch.hasMore).toBe(true);
    expect(secondBatch.matches).toHaveLength(2);
    expect(secondBatch.hasMore).toBe(true);
    expect(thirdBatch.matches).toHaveLength(1);
    expect(thirdBatch.hasMore).toBe(false);
    expect([
      ...firstBatch.matches,
      ...secondBatch.matches,
      ...thirdBatch.matches,
    ]).toHaveLength(5);
  });
});
