import type { ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildLargeViewerData, findFirstRegionIndexAtStartLine } from '../utils/largeJsonViewerData';
import { LargeJsonVisibleRows } from './LargeJsonVisibleRows';

describe('LargeJsonVisibleRows', () => {
  it('checks collapsed state only after a row is known to start a fold region', () => {
    const lines = ['{', '  "items": [', '    1,', '    2', '  ],', '  "ok": true', '}'];
    const text = lines.join('\n');
    const data = buildLargeViewerData(text, 1);
    if (!data) {
      throw new Error('Expected large viewer data');
    }
    const isRegionCollapsed = vi.fn((_lineNumber: number) => false);

    render(
      <LargeJsonVisibleRows
        data={data}
        endVisibleIndex={data.lineCount - 1}
        getActualLineNumber={(visibleIndex) => visibleIndex + 1}
        getLineSelectionRange={() => null}
        getLineText={(lineNumber) => lines[lineNumber - 1] ?? ''}
        getRegionEndLineByStartLine={(lineNumber) => {
          const regionIndex = findFirstRegionIndexAtStartLine(data.regions, lineNumber);
          return regionIndex >= 0 ? data.regions.endLines[regionIndex] : null;
        }}
        getRowStyle={(visibleIndex) => ({ height: 18, top: visibleIndex * 18 })}
        isRegionCollapsed={isRegionCollapsed}
        isLineSelected={() => false}
        lineNumberWidth="3ch"
        onLocateOffset={vi.fn()}
        renderLineText={(_lineNumber, lineText) => lineText}
        resolveOffsetFromPoint={() => 0}
        setContextMenu={vi.fn()}
        startVisibleIndex={0}
        toggleLine={vi.fn()}
        wrapLongLines={false}
      />
    );

    expect(isRegionCollapsed.mock.calls.map(([lineNumber]) => lineNumber)).toEqual([1, 2]);
  });

  it('memoizes overlapping rows while the virtual window scrolls', () => {
    const lines = ['{', '  "a": 1,', '  "b": 2,', '  "c": 3,', '  "d": 4,', '  "e": 5', '}'];
    const data = buildLargeViewerData(lines.join('\n'), 1);
    if (!data) {
      throw new Error('Expected large viewer data');
    }
    const renderLineText = vi.fn((_lineNumber: number, lineText: string) => lineText);
    const getLineSelectionRange = vi.fn(() => null);
    const getLineText = vi.fn((lineNumber: number) => lines[lineNumber - 1] ?? '');
    const getRegionEndLineByStartLine = vi.fn((lineNumber: number) => (lineNumber === 1 ? data.lineCount : null));
    const getRowStyle = vi.fn((visibleIndex: number) => ({ height: 18, top: visibleIndex * 18 }));
    const isLineSelected = vi.fn(() => false);
    const baseProps: ComponentProps<typeof LargeJsonVisibleRows> = {
      data,
      endVisibleIndex: 4,
      getActualLineNumber: (visibleIndex) => visibleIndex + 1,
      getLineSelectionRange,
      getLineText,
      getRegionEndLineByStartLine,
      getRowStyle,
      isRegionCollapsed: () => false,
      isLineSelected,
      lineNumberWidth: '3ch',
      onLocateOffset: vi.fn(),
      renderLineText,
      resolveOffsetFromPoint: () => 0,
      setContextMenu: vi.fn(),
      startVisibleIndex: 0,
      toggleLine: vi.fn(),
      wrapLongLines: false,
    };
    const { rerender } = render(<LargeJsonVisibleRows {...baseProps} />);

    expect(renderLineText).toHaveBeenCalledTimes(5);
    expect(getLineText).toHaveBeenCalledTimes(5);
    expect(getRowStyle).toHaveBeenCalledTimes(5);
    expect(getRegionEndLineByStartLine).toHaveBeenCalledTimes(5);
    expect(isLineSelected).toHaveBeenCalledTimes(5);
    expect(getLineSelectionRange).toHaveBeenCalledTimes(5);
    rerender(<LargeJsonVisibleRows {...baseProps} startVisibleIndex={1} endVisibleIndex={5} />);
    expect(renderLineText).toHaveBeenCalledTimes(6);
    expect(getLineText).toHaveBeenCalledTimes(6);
    expect(getRowStyle).toHaveBeenCalledTimes(6);
    expect(getRegionEndLineByStartLine).toHaveBeenCalledTimes(6);
    expect(isLineSelected).toHaveBeenCalledTimes(6);
    expect(getLineSelectionRange).toHaveBeenCalledTimes(6);
  });
});
