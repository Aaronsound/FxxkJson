import React from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { LargeJsonViewerData, LargeJsonViewerRegion } from '../types/jsonTool';
import { getFirstMeaningfulOffset, getLargeJsonLineTitle } from '../utils/largeJsonViewerDom';
import { getCollapsedPreview } from '../utils/largeJsonViewerRender';
import { getViewportContextMenuPosition } from '../utils/contextMenuPosition';
import type { LargeJsonContextMenuState } from './LargeJsonContextMenu';

interface LocalSelectionRange {
  start: number;
  end: number;
}

interface LargeJsonVisibleRowsProps {
  collapsedLineSet: Set<number>;
  data: LargeJsonViewerData;
  endVisibleIndex: number;
  getActualLineNumber: (visibleIndex: number) => number | null;
  getLineSelectionRange: (
    lineNumber: number,
    baseLineText: string,
    renderedLineText: string,
    region: LargeJsonViewerRegion | undefined,
    isCollapsed: boolean
  ) => LocalSelectionRange | null;
  getLineText: (lineNumber: number) => string;
  isLineSelected: (lineNumber: number) => boolean;
  lineNumberWidth: string;
  onLocateOffset: (offset: number) => void;
  regionsByStartLine: Map<number, LargeJsonViewerRegion>;
  renderLineText: (
    lineNumber: number,
    lineText: string,
    selectedLineRange: LocalSelectionRange | null
  ) => React.ReactNode;
  resolveOffsetFromPoint: (event: ReactMouseEvent<HTMLElement>, lineNumber: number, lineText: string) => number;
  rowHeight: number;
  setContextMenu: React.Dispatch<React.SetStateAction<LargeJsonContextMenuState | null>>;
  startVisibleIndex: number;
  toggleLine: (lineNumber: number) => void;
  wrapLongLines: boolean;
}

function hasTextSelectionInside(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  return (
    element.contains(range.startContainer) ||
    element.contains(range.endContainer) ||
    element.contains(range.commonAncestorContainer)
  );
}

export function LargeJsonVisibleRows({
  collapsedLineSet,
  data,
  endVisibleIndex,
  getActualLineNumber,
  getLineSelectionRange,
  getLineText,
  isLineSelected,
  lineNumberWidth,
  onLocateOffset,
  regionsByStartLine,
  renderLineText,
  resolveOffsetFromPoint,
  rowHeight,
  setContextMenu,
  startVisibleIndex,
  toggleLine,
  wrapLongLines,
}: LargeJsonVisibleRowsProps) {
  const renderedRows = [];

  for (let visibleIndex = startVisibleIndex; visibleIndex <= endVisibleIndex; visibleIndex += 1) {
    const lineNumber = getActualLineNumber(visibleIndex);
    if (lineNumber === null) {
      continue;
    }

    const region = regionsByStartLine.get(lineNumber);
    const isCollapsed = collapsedLineSet.has(lineNumber);
    const baseLineText = getLineText(lineNumber);
    const lineText = region && isCollapsed ? getCollapsedPreview(baseLineText) : baseLineText;
    const isSelected = isLineSelected(lineNumber);
    const selectedLineRange = getLineSelectionRange(lineNumber, baseLineText, lineText, region, isCollapsed);

    renderedRows.push(
      <div
        key={`${lineNumber}-${visibleIndex}`}
        className={`large-json-row ${wrapLongLines ? 'wrap' : ''} ${isSelected ? 'selected' : ''}`}
        onMouseUp={(event) => {
          if (event.button !== 0) {
            return;
          }

          if (hasTextSelectionInside(event.currentTarget)) {
            return;
          }

          if (event.target instanceof HTMLElement && event.target.closest('.large-json-fold-button')) {
            return;
          }

          const offset = (data.lineStarts[lineNumber - 1] ?? 0) + getFirstMeaningfulOffset(baseLineText);
          onLocateOffset(offset);
        }}
        style={{
          top: `${visibleIndex * rowHeight}px`,
          height: `${rowHeight}px`,
        }}
      >
        <span className="large-json-line-number" style={{ width: lineNumberWidth }}>
          {lineNumber}
        </span>
        <button
          type="button"
          className={`large-json-fold-button ${region ? 'visible' : ''} ${isCollapsed ? 'collapsed' : 'expanded'}`}
          onClick={() => toggleLine(lineNumber)}
          onMouseDown={(event) => event.preventDefault()}
          disabled={!region}
          aria-label={isCollapsed ? 'Expand node' : 'Collapse node'}
        />
        <span
          className={`large-json-line-text ${wrapLongLines ? 'wrap' : ''}`}
          data-line-number={lineNumber}
          data-collapsed={isCollapsed ? 'true' : undefined}
          title={getLargeJsonLineTitle(lineText)}
          onMouseUp={(event) => {
            if (event.button !== 0) {
              return;
            }

            if (hasTextSelectionInside(event.currentTarget)) {
              event.stopPropagation();
              return;
            }

            const offset = resolveOffsetFromPoint(event, lineNumber, baseLineText);
            event.stopPropagation();
            onLocateOffset(offset);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const offset = resolveOffsetFromPoint(event, lineNumber, baseLineText);
            const menuPosition = getViewportContextMenuPosition(
              event.clientX,
              event.clientY,
              regionsByStartLine.has(lineNumber) ? 10 : 9
            );
            setContextMenu({
              x: menuPosition.x,
              y: menuPosition.y,
              offset,
              foldLine: regionsByStartLine.has(lineNumber) ? lineNumber : null,
            });
          }}
        >
          {renderLineText(lineNumber, lineText, selectedLineRange)}
        </span>
      </div>
    );
  }

  return <>{renderedRows}</>;
}
