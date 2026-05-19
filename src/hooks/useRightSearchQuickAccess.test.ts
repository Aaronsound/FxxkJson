import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getCompactPathLabel, useRightSearchQuickAccess } from './useRightSearchQuickAccess';

describe('useRightSearchQuickAccess', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('remembers recent right-pane searches in local storage', () => {
    const { result } = renderHook(() => useRightSearchQuickAccess('tab-a'));

    act(() => {
      result.current.rememberRightSearchTerm('status');
      result.current.rememberRightSearchTerm('name');
    });

    expect(result.current.rightRecentSearches).toEqual(['name', 'status']);
    expect(JSON.parse(window.localStorage.getItem('hanjson.rightSearch.recent.v1') ?? '[]')).toEqual(['name', 'status']);
  });

  it('pins active node paths per tab', () => {
    const { result } = renderHook(() => useRightSearchQuickAccess('tab-a'));

    act(() => {
      result.current.pinRightPath('tab-a', {
        path: ['items', 0, 'name'],
        pathText: '$.items[0].name',
        startOffset: 12,
        endOffset: 18,
        updatedAt: 1,
      });
    });

    expect(result.current.activeRightPinnedPathItems).toEqual([
      {
        id: '$.items[0].name:12',
        label: '$.items[0].name',
        detail: '$.items[0].name',
      },
    ]);
    expect(result.current.getPinnedPath('tab-a', '$.items[0].name:12')?.startOffset).toBe(12);
  });

  it('compacts long labels for quick access menus', () => {
    const label = getCompactPathLabel(`$.${'a'.repeat(160)}`);

    expect(label).toHaveLength(120);
    expect(label.endsWith('...')).toBe(true);
  });
});
