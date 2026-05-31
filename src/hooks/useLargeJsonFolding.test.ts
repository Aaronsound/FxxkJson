import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLargeJsonFolding } from './useLargeJsonFolding';

const data = {
  lineStarts: new Uint32Array([0, 2, 4, 6, 8]),
  lineCount: 5,
  regions: [
    { startLine: 1, endLine: 5, kind: 'object' as const },
    { startLine: 2, endLine: 4, kind: 'array' as const },
  ],
};

describe('useLargeJsonFolding', () => {
  it('normalizes collapsed lines and builds visible segments', () => {
    const onCollapsedLinesChange = vi.fn();
    const { result } = renderHook(() =>
      useLargeJsonFolding({
        collapsedLines: [2, 99, 2],
        data,
        onCollapsedLinesChange,
      })
    );

    expect(result.current.normalizedCollapsedLines).toEqual([2]);
    expect(result.current.collapsedLineSet.has(2)).toBe(true);
    expect(result.current.visibleLineCount).toBeLessThan(data.lineCount);
  });

  it('toggles and folds all lines', () => {
    const onCollapsedLinesChange = vi.fn();
    const { result } = renderHook(() =>
      useLargeJsonFolding({
        collapsedLines: [],
        data,
        onCollapsedLinesChange,
      })
    );

    act(() => result.current.toggleLine(2));
    expect(onCollapsedLinesChange).toHaveBeenCalledWith([2]);

    act(() => result.current.foldAll());
    expect(onCollapsedLinesChange).toHaveBeenCalledWith([1, 2]);

    act(() => result.current.unfoldAll());
    expect(onCollapsedLinesChange).toHaveBeenCalledWith([]);
  });
});
