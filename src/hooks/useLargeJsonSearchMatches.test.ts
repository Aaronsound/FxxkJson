// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import { groupSearchMatchesByLine } from './useLargeJsonSearchMatches';

describe('groupSearchMatchesByLine', () => {
  it('groups matches while reusing decoded match objects', () => {
    const first: LargeJsonSearchMatch = {
      start: 1,
      end: 2,
      lineNumber: 1,
      lineStartOffset: 0,
      localStart: 1,
      localEnd: 2,
    };
    const second: LargeJsonSearchMatch = {
      start: 8,
      end: 9,
      lineNumber: 2,
      lineStartOffset: 6,
      localStart: 2,
      localEnd: 3,
    };

    const grouped = groupSearchMatchesByLine([first, second]);

    expect(grouped.get(1)?.[0]).toBe(first);
    expect(grouped.get(2)?.[0]).toBe(second);
    expect(first.matchIndex).toBe(0);
    expect(second.matchIndex).toBe(1);
  });
});
