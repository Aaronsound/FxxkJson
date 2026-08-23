import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getLargeJsonViewerRegionAtStartLine, buildLargeViewerData } from '../utils/largeJsonViewerData';
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
        getRegionByStartLine={(lineNumber) =>
          getLargeJsonViewerRegionAtStartLine(data.regions, lineNumber) ?? undefined
        }
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
});
