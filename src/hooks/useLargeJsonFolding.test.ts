import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';
import { insertSortedFoldLine, removeSortedFoldLine, useLargeJsonFolding } from './useLargeJsonFolding';

const data = buildLargeViewerData(['{', '  "items": [', '    1', '  ]', '}'].join('\n'), 1);
if (!data) {
  throw new Error('Expected folding test data');
}

describe('useLargeJsonFolding', () => {
  it('inserts and removes fold lines without sorting or filtering the full state', () => {
    const lines = [1, 4, 9];

    expect(insertSortedFoldLine(lines, 6)).toEqual([1, 4, 6, 9]);
    expect(insertSortedFoldLine(lines, 4)).toBe(lines);
    expect(removeSortedFoldLine(lines, 4)).toEqual([1, 9]);
    expect(removeSortedFoldLine(lines, 5)).toBe(lines);
  });

  it('normalizes explicit collapsed lines and builds visible segments', () => {
    const onFoldStateChange = vi.fn();
    const { result } = renderHook(() =>
      useLargeJsonFolding({
        foldState: { mode: 'explicit', lines: [2, 99, 2] },
        data,
        onFoldStateChange,
      })
    );

    expect(result.current.normalizedStateLines).toEqual([2]);
    expect(result.current.getRegionEndLineByStartLine(2)).toBe(4);
    expect(result.current.getRegionEndLineByStartLine(99)).toBeNull();
    expect(result.current.isLineCollapsed(2)).toBe(true);
    expect(result.current.isRegionCollapsed(2)).toBe(true);
    expect(result.current.isLineCollapsed(99)).toBe(false);
    expect(result.current.visibleLineCount).toBeLessThan(data.lineCount);
  });

  it('toggles explicit folds without changing their semantics', () => {
    const onFoldStateChange = vi.fn();
    const { result } = renderHook(() =>
      useLargeJsonFolding({
        foldState: { mode: 'explicit', lines: [] },
        data,
        onFoldStateChange,
      })
    );

    act(() => result.current.toggleLine(2));
    expect(onFoldStateChange).toHaveBeenCalledWith({ mode: 'explicit', lines: [2] });

    act(() => result.current.unfoldAll());
    expect(onFoldStateChange).toHaveBeenCalledWith({ mode: 'explicit', lines: [] });
  });

  it('represents fold all with an empty exception list and expands one line as an exception', () => {
    const onFoldStateChange = vi.fn();
    type FoldProps = { mode: 'explicit' | 'all-except'; lines: number[] };
    const { result, rerender } = renderHook(
      ({ mode, lines }: FoldProps) =>
        useLargeJsonFolding({
          foldState: { mode, lines },
          data,
          onFoldStateChange,
        }),
      { initialProps: { mode: 'explicit', lines: [] } as FoldProps }
    );

    act(() => result.current.foldAll());
    expect(onFoldStateChange).toHaveBeenCalledWith({ mode: 'all-except', lines: [] });

    rerender({ mode: 'all-except', lines: [] });
    expect(result.current.isLineCollapsed(1)).toBe(true);
    act(() => result.current.toggleLine(1));
    expect(onFoldStateChange).toHaveBeenLastCalledWith({ mode: 'all-except', lines: [1] });
  });
});
