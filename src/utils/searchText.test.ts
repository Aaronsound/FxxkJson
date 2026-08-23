// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import { buildLineStarts, findTextSearchBatch, findTextSearchBatchAsync, replaceTextSearchMatches } from './searchText';

describe('searchText', () => {
  it('builds compact typed line indexes after the inline threshold', () => {
    const text = Array.from({ length: 5_000 }, (_, index) => String(index)).join('\n');
    const lineStarts = buildLineStarts(text);

    expect(lineStarts).toBeInstanceOf(Uint32Array);
    expect(lineStarts).toHaveLength(5_000);
    expect(lineStarts[4_999]).toBe(text.lastIndexOf('\n') + 1);
  });

  it('loads complete search results across multiple batches', () => {
    const text = Array.from({ length: 5 }, (_, index) => `FxxkJson item ${index}`).join('\n');
    const lineStarts = buildLineStarts(text);

    const firstBatch = findTextSearchBatch(
      text,
      lineStarts,
      lineStarts.length,
      'FxxkJson',
      DEFAULT_SEARCH_OPTIONS,
      0,
      2
    );

    const secondBatch = findTextSearchBatch(
      text,
      lineStarts,
      lineStarts.length,
      'FxxkJson',
      DEFAULT_SEARCH_OPTIONS,
      firstBatch.nextStartOffset,
      2
    );

    const thirdBatch = findTextSearchBatch(
      text,
      lineStarts,
      lineStarts.length,
      'FxxkJson',
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
    expect([...firstBatch.matches, ...secondBatch.matches, ...thirdBatch.matches]).toHaveLength(5);
  });

  it('replaces every text match beyond the paged search batch', () => {
    const text = Array.from({ length: 2_005 }, (_, index) => `before-${index}`).join('\n');

    expect(
      replaceTextSearchMatches(text, 'before', { matchCase: false, wholeWord: true, useRegex: false }, 'after')
    ).toBe(Array.from({ length: 2_005 }, (_, index) => `after-${index}`).join('\n'));
  });

  it('keeps regex replacement and whole-word search semantics for full replacement', () => {
    expect(
      replaceTextSearchMatches(
        'item-1 item-22 item-3 items-4',
        'item-(\\d+)',
        { matchCase: true, wholeWord: true, useRegex: true },
        'node-$1'
      )
    ).toBe('node-1 node-22 node-3 items-4');
  });

  it('can cancel async batched searches before returning stale results', async () => {
    const text = Array.from({ length: 1000 }, (_, index) => `FxxkJson item ${index}`).join('\n');
    const lineStarts = buildLineStarts(text);

    const result = await findTextSearchBatchAsync(
      text,
      lineStarts,
      lineStarts.length,
      'FxxkJson',
      DEFAULT_SEARCH_OPTIONS,
      0,
      500,
      () => true
    );

    expect(result.cancelled).toBe(true);
    expect(result.matches).toHaveLength(0);
  });

  it('keeps escaped literal and case-insensitive semantics in async searches', async () => {
    const text = 'A.B a.b axb';
    const lineStarts = buildLineStarts(text);
    const result = await findTextSearchBatchAsync(text, lineStarts, lineStarts.length, 'a.b', DEFAULT_SEARCH_OPTIONS);

    expect(result.matches.map((match) => text.slice(match.start, match.end))).toEqual(['A.B', 'a.b']);
  });

  it('yields and cancels regex batches before stale matches finish scanning', async () => {
    const text = Array.from({ length: 1000 }, (_, index) => `FxxkJson item ${index}`).join('\n');
    const lineStarts = buildLineStarts(text);
    let checks = 0;

    const result = await findTextSearchBatchAsync(
      text,
      lineStarts,
      lineStarts.length,
      'FxxkJson item \\d+',
      { matchCase: true, wholeWord: false, useRegex: true },
      0,
      500,
      () => {
        checks += 1;
        return checks > 252;
      }
    );

    expect(result.cancelled).toBe(true);
    expect(result.matches).toHaveLength(0);
  });

  it('rejects regex patterns that are likely to cause catastrophic backtracking', async () => {
    const text = `${'a'.repeat(5000)}!`;
    const lineStarts = buildLineStarts(text);

    const result = await findTextSearchBatchAsync(
      text,
      lineStarts,
      lineStarts.length,
      '(a+)+$',
      { matchCase: true, wholeWord: false, useRegex: true },
      0,
      500
    );

    expect(result.matches).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });
});
