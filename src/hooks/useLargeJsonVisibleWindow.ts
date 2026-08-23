import { useCallback } from 'react';
import { binarySearchSegment, getLargeJsonVisibleIndexAtOffset } from '../utils/largeJsonViewerRender';
import type { VisibleSegment } from '../utils/largeJsonViewerRender';

interface UseLargeJsonVisibleWindowArgs {
  rowHeight: number;
  rowOffsets?: Uint32Array | null;
  scrollTop: number;
  viewportHeight: number;
  visibleLineCount: number;
  visibleSegments: VisibleSegment[];
  overscan: number;
}

export function useLargeJsonVisibleWindow({
  rowHeight,
  rowOffsets = null,
  scrollTop,
  viewportHeight,
  visibleLineCount,
  visibleSegments,
  overscan,
}: UseLargeJsonVisibleWindowArgs) {
  const getActualLineNumber = useCallback(
    (visibleIndex: number) => {
      const segment = binarySearchSegment(visibleSegments, visibleIndex);
      if (!segment) {
        return null;
      }

      return segment.actualStart + (visibleIndex - segment.visibleStart);
    },
    [visibleSegments]
  );

  const getVisibleIndexForActualLine = useCallback(
    (lineNumber: number) => {
      for (const segment of visibleSegments) {
        if (lineNumber < segment.actualStart) {
          break;
        }

        if (lineNumber <= segment.actualEnd) {
          return segment.visibleStart + (lineNumber - segment.actualStart);
        }
      }

      return null;
    },
    [visibleSegments]
  );

  const getRowTop = useCallback(
    (visibleIndex: number) => {
      if (rowOffsets) {
        const index = Math.max(0, Math.min(visibleIndex, rowOffsets.length - 1));
        return rowOffsets[index] ?? 0;
      }
      return Math.max(0, visibleIndex) * rowHeight;
    },
    [rowHeight, rowOffsets]
  );

  const getRowHeight = useCallback(
    (visibleIndex: number) => {
      if (rowOffsets) {
        const index = Math.max(0, Math.min(visibleIndex, rowOffsets.length - 2));
        return (rowOffsets[index + 1] ?? 0) - (rowOffsets[index] ?? 0);
      }
      return rowHeight;
    },
    [rowHeight, rowOffsets]
  );

  const startIndex = rowOffsets
    ? getLargeJsonVisibleIndexAtOffset(rowOffsets, scrollTop)
    : Math.floor(scrollTop / rowHeight);
  const endIndex = rowOffsets
    ? getLargeJsonVisibleIndexAtOffset(rowOffsets, scrollTop + viewportHeight)
    : Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const startVisibleIndex = Math.max(0, startIndex - overscan);
  const endVisibleIndex = Math.min(Math.max(0, visibleLineCount - 1), endIndex + overscan);

  return {
    endVisibleIndex,
    getActualLineNumber,
    getRowHeight,
    getRowTop,
    getVisibleIndexForActualLine,
    startVisibleIndex,
  };
}
