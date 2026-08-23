import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import { areLargeJsonLineTextPropsEqual, LargeJsonLineText } from './LargeJsonLineText';

function createMatch(matchIndex: number): LargeJsonSearchMatch & { matchIndex: number } {
  return {
    start: 3,
    end: 7,
    lineNumber: 1,
    lineStartOffset: 0,
    localStart: 3,
    localEnd: 7,
    matchIndex,
  };
}

function createProps(activeMatchIndex: number, matches: Array<LargeJsonSearchMatch & { matchIndex: number }>) {
  return {
    activeMatchIndex,
    lineNumber: 1,
    lineText: '  "name": true',
    matches,
    selectedLineRange: null,
  };
}

describe('LargeJsonLineText memoization', () => {
  it('skips active-index updates that cannot change this line', () => {
    const matches = [createMatch(4)];

    expect(areLargeJsonLineTextPropsEqual(createProps(1, matches), createProps(2, matches))).toBe(true);
    expect(areLargeJsonLineTextPropsEqual(createProps(4, matches), createProps(2, matches))).toBe(false);
    expect(areLargeJsonLineTextPropsEqual(createProps(1, matches), createProps(4, matches))).toBe(false);
  });

  it('does not skip text, match-list, or selection changes', () => {
    const matches = [createMatch(4)];
    const previous = createProps(1, matches);

    expect(areLargeJsonLineTextPropsEqual(previous, { ...previous, lineText: 'changed' })).toBe(false);
    expect(areLargeJsonLineTextPropsEqual(previous, { ...previous, matches: [...matches] })).toBe(false);
    expect(areLargeJsonLineTextPropsEqual(previous, { ...previous, selectedLineRange: { start: 0, end: 2 } })).toBe(
      false
    );
  });

  it('updates the active highlight when this line contains the changed match', () => {
    const matches = [createMatch(4)];
    const { container, rerender } = render(<LargeJsonLineText {...createProps(1, matches)} />);
    expect(container.querySelector('mark.active')).toBeNull();

    rerender(<LargeJsonLineText {...createProps(4, matches)} />);
    expect(container.querySelector('mark.active')?.textContent).toBe('name');
  });
});
