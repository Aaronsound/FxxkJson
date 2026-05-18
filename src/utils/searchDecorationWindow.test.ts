// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getSearchDecorationWindow } from './searchDecorationWindow';

describe('getSearchDecorationWindow', () => {
  it('returns every match when the match count is below the decoration window size', () => {
    expect(getSearchDecorationWindow(['a', 'b', 'c'], 1, 2)).toEqual([
      { matchIndex: 0, range: 'a' },
      { matchIndex: 1, range: 'b' },
      { matchIndex: 2, range: 'c' },
    ]);
  });

  it('returns only nearby matches around the active match', () => {
    const matches = Array.from({ length: 10 }, (_, index) => `match-${index}`);

    expect(getSearchDecorationWindow(matches, 5, 2)).toEqual([
      { matchIndex: 3, range: 'match-3' },
      { matchIndex: 4, range: 'match-4' },
      { matchIndex: 5, range: 'match-5' },
      { matchIndex: 6, range: 'match-6' },
      { matchIndex: 7, range: 'match-7' },
    ]);
  });

  it('keeps a full window near the end of the match list', () => {
    const matches = Array.from({ length: 10 }, (_, index) => `match-${index}`);

    expect(getSearchDecorationWindow(matches, 9, 2)).toEqual([
      { matchIndex: 5, range: 'match-5' },
      { matchIndex: 6, range: 'match-6' },
      { matchIndex: 7, range: 'match-7' },
      { matchIndex: 8, range: 'match-8' },
      { matchIndex: 9, range: 'match-9' },
    ]);
  });
});
