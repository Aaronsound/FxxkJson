import { useCallback } from 'react';
import {
  getActualLineNumberFromVisibleSegments,
  getLargeJsonRowLayout,
  getLargeJsonRowTop,
  getLargeJsonVisibleIndexAtOffset,
  getVisibleIndexFromVisibleSegments,
} from '../utils/largeJsonViewerRender';
import type { LargeJsonWrapLayout, VisibleSegment } from '../utils/largeJsonViewerRender';

interface UseLargeJsonVisibleWindowArgs {
  rowHeight: number;
  wrapLayout?: LargeJsonWrapLayout | null;
  scrollTop: number;
  viewportHeight: number;
  visibleLineCount: number;
  visibleSegments: VisibleSegment[];
  overscan: number;
}

export function useLargeJsonVisibleWindow({
  rowHeight,
  wrapLayout = null,
  scrollTop,
  viewportHeight,
  visibleLineCount,
  visibleSegments,
  overscan,
}: UseLargeJsonVisibleWindowArgs) {
  const getActualLineNumber = useCallback(
    (visibleIndex: number) => getActualLineNumberFromVisibleSegments(visibleSegments, visibleIndex),
    [visibleSegments]
  );

  const getVisibleIndexForActualLine = useCallback(
    (lineNumber: number) => getVisibleIndexFromVisibleSegments(visibleSegments, lineNumber),
    [visibleSegments]
  );

  const getRowTop = useCallback(
    (visibleIndex: number) => {
      if (wrapLayout) {
        return getLargeJsonRowTop(wrapLayout, visibleIndex);
      }
      return Math.max(0, visibleIndex) * rowHeight;
    },
    [rowHeight, wrapLayout]
  );

  const getRowStyle = useCallback(
    (visibleIndex: number) => {
      if (wrapLayout) {
        return getLargeJsonRowLayout(wrapLayout, visibleIndex);
      }
      return {
        height: rowHeight,
        top: Math.max(0, visibleIndex) * rowHeight,
      };
    },
    [rowHeight, wrapLayout]
  );

  const startIndex = wrapLayout
    ? getLargeJsonVisibleIndexAtOffset(wrapLayout, scrollTop)
    : Math.floor(scrollTop / rowHeight);
  const endIndex = wrapLayout
    ? getLargeJsonVisibleIndexAtOffset(wrapLayout, scrollTop + viewportHeight)
    : Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const startVisibleIndex = Math.max(0, startIndex - overscan);
  const endVisibleIndex = Math.min(Math.max(0, visibleLineCount - 1), endIndex + overscan);

  return {
    endVisibleIndex,
    getActualLineNumber,
    getRowStyle,
    getRowTop,
    getVisibleIndexForActualLine,
    startVisibleIndex,
  };
}
