import { memo } from 'react';
import type { Dispatch, MouseEvent as ReactMouseEvent, ReactNode, SetStateAction } from 'react';
import type { LargeJsonViewerData } from '../types/jsonTool';
import { getFirstMeaningfulOffset, getLargeJsonLineTitle } from '../utils/largeJsonViewerDom';
import { getCollapsedPreview } from '../utils/largeJsonViewerRender';
import { getViewportContextMenuPosition } from '../utils/contextMenuPosition';
import { getRegionFoldTargets } from '../utils/largeJsonFoldTarget';
import type { LargeJsonContextMenuState } from './LargeJsonContextMenu';

interface LocalSelectionRange {
  start: number;
  end: number;
}

interface LargeJsonVisibleRowsProps {
  data: LargeJsonViewerData;
  endVisibleIndex: number;
  getActualLineNumber: (visibleIndex: number) => number | null;
  getLineSelectionRange: (
    lineNumber: number,
    baseLineText: string,
    renderedLineText: string,
    regionEndLine: number | null,
    isCollapsed: boolean
  ) => LocalSelectionRange | null;
  getLineText: (lineNumber: number) => string;
  getRegionEndLineByStartLine: (lineNumber: number) => number | null;
  getRowStyle: (visibleIndex: number) => { height: number; top: number };
  isRegionCollapsed: (lineNumber: number) => boolean;
  isLineSelected: (lineNumber: number) => boolean;
  lineNumberWidth: string;
  onLocateOffset: (offset: number) => void;
  renderLineText: (lineNumber: number, lineText: string, selectedLineRange: LocalSelectionRange | null) => ReactNode;
  resolveOffsetFromPoint: (event: ReactMouseEvent<HTMLElement>, lineNumber: number, lineText: string) => number;
  setContextMenu: Dispatch<SetStateAction<LargeJsonContextMenuState | null>>;
  startVisibleIndex: number;
  toggleLine: (lineNumber: number) => void;
  wrapLongLines: boolean;
}

interface LargeJsonVisibleRowProps {
  baseLineText: string;
  data: LargeJsonViewerData;
  hasRegion: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  lineNumber: number;
  lineNumberWidth: string;
  lineText: string;
  onLocateOffset: (offset: number) => void;
  renderLineText: (lineNumber: number, lineText: string, selectedLineRange: LocalSelectionRange | null) => ReactNode;
  resolveOffsetFromPoint: (event: ReactMouseEvent<HTMLElement>, lineNumber: number, lineText: string) => number;
  rowStyle: { height: number; top: number };
  selectedLineRange: LocalSelectionRange | null;
  setContextMenu: Dispatch<SetStateAction<LargeJsonContextMenuState | null>>;
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

function equalSelectionRange(left: LocalSelectionRange | null, right: LocalSelectionRange | null) {
  return left === right || Boolean(left && right && left.start === right.start && left.end === right.end);
}

export function areLargeJsonVisibleRowPropsEqual(previous: LargeJsonVisibleRowProps, next: LargeJsonVisibleRowProps) {
  return (
    previous.baseLineText === next.baseLineText &&
    previous.data === next.data &&
    previous.hasRegion === next.hasRegion &&
    previous.isCollapsed === next.isCollapsed &&
    previous.isSelected === next.isSelected &&
    previous.lineNumber === next.lineNumber &&
    previous.lineNumberWidth === next.lineNumberWidth &&
    previous.lineText === next.lineText &&
    previous.onLocateOffset === next.onLocateOffset &&
    previous.renderLineText === next.renderLineText &&
    previous.resolveOffsetFromPoint === next.resolveOffsetFromPoint &&
    previous.rowStyle.height === next.rowStyle.height &&
    previous.rowStyle.top === next.rowStyle.top &&
    equalSelectionRange(previous.selectedLineRange, next.selectedLineRange) &&
    previous.setContextMenu === next.setContextMenu &&
    previous.toggleLine === next.toggleLine &&
    previous.wrapLongLines === next.wrapLongLines
  );
}

function LargeJsonVisibleRowView({
  baseLineText,
  data,
  hasRegion,
  isCollapsed,
  isSelected,
  lineNumber,
  lineNumberWidth,
  lineText,
  onLocateOffset,
  renderLineText,
  resolveOffsetFromPoint,
  rowStyle,
  selectedLineRange,
  setContextMenu,
  toggleLine,
  wrapLongLines,
}: LargeJsonVisibleRowProps) {
  return (
    <div
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
      style={rowStyle}
    >
      <span className="large-json-line-number" style={{ width: lineNumberWidth }}>
        {lineNumber}
      </span>
      <button
        type="button"
        className={`large-json-fold-button ${hasRegion ? 'visible' : ''} ${isCollapsed ? 'collapsed' : 'expanded'}`}
        onClick={() => toggleLine(lineNumber)}
        onMouseDown={(event) => event.preventDefault()}
        disabled={!hasRegion}
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
          const foldTargets = getRegionFoldTargets(data.regions, lineNumber);
          const menuPosition = getViewportContextMenuPosition(
            event.clientX,
            event.clientY,
            9 + Number(Boolean(foldTargets.currentLine)) + Number(Boolean(foldTargets.parentLine))
          );
          setContextMenu({
            x: menuPosition.x,
            y: menuPosition.y,
            offset,
            foldLine: foldTargets.currentLine,
            parentFoldLine: foldTargets.parentLine,
          });
        }}
      >
        {renderLineText(lineNumber, lineText, selectedLineRange)}
      </span>
    </div>
  );
}

const LargeJsonVisibleRow = memo(LargeJsonVisibleRowView, areLargeJsonVisibleRowPropsEqual);
LargeJsonVisibleRow.displayName = 'LargeJsonVisibleRow';

export function LargeJsonVisibleRows({
  data,
  endVisibleIndex,
  getActualLineNumber,
  getLineSelectionRange,
  getLineText,
  getRegionEndLineByStartLine,
  getRowStyle,
  isRegionCollapsed,
  isLineSelected,
  lineNumberWidth,
  onLocateOffset,
  renderLineText,
  resolveOffsetFromPoint,
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

    const regionEndLine = getRegionEndLineByStartLine(lineNumber);
    const hasRegion = regionEndLine !== null;
    const isCollapsed = hasRegion && isRegionCollapsed(lineNumber);
    const baseLineText = getLineText(lineNumber);
    const lineText = isCollapsed ? getCollapsedPreview(baseLineText) : baseLineText;
    const isSelected = isLineSelected(lineNumber);
    const selectedLineRange = getLineSelectionRange(lineNumber, baseLineText, lineText, regionEndLine, isCollapsed);
    const rowStyle = getRowStyle(visibleIndex);

    renderedRows.push(
      <LargeJsonVisibleRow
        key={lineNumber}
        baseLineText={baseLineText}
        data={data}
        hasRegion={hasRegion}
        isCollapsed={isCollapsed}
        isSelected={isSelected}
        lineNumber={lineNumber}
        lineNumberWidth={lineNumberWidth}
        lineText={lineText}
        onLocateOffset={onLocateOffset}
        renderLineText={renderLineText}
        resolveOffsetFromPoint={resolveOffsetFromPoint}
        rowStyle={rowStyle}
        selectedLineRange={selectedLineRange}
        setContextMenu={setContextMenu}
        toggleLine={toggleLine}
        wrapLongLines={wrapLongLines}
      />
    );
  }

  return <>{renderedRows}</>;
}
