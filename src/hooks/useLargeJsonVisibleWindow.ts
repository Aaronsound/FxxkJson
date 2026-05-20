import { useCallback } from 'react';
import {
  binarySearchSegment,
} from '../utils/largeJsonViewerRender';
import type { VisibleSegment } from '../utils/largeJsonViewerRender';

interface UseLargeJsonVisibleWindowArgs {
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
  visibleLineCount: number;
  visibleSegments: VisibleSegment[];
  overscan: number;
}

export function useLargeJsonVisibleWindow({
  rowHeight,
  scrollTop,
  viewportHeight,
  visibleLineCount,
  visibleSegments,
  overscan,
}: UseLargeJsonVisibleWindowArgs) {
  const getActualLineNumber = useCallback((visibleIndex: number) => {
    const segment = binarySearchSegment(visibleSegments, visibleIndex);
    if (!segment) {
      return null;
    }

    return segment.actualStart + (visibleIndex - segment.visibleStart);
  }, [visibleSegments]);

  const getVisibleIndexForActualLine = useCallback((lineNumber: number) => {
    for (const segment of visibleSegments) {
      if (lineNumber < segment.actualStart) {
        break;
      }

      if (lineNumber <= segment.actualEnd) {
        return segment.visibleStart + (lineNumber - segment.actualStart);
      }
    }

    return null;
  }, [visibleSegments]);

  const startVisibleIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endVisibleIndex = Math.min(
    Math.max(0, visibleLineCount - 1),
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );

  return {
    endVisibleIndex,
    getActualLineNumber,
    getVisibleIndexForActualLine,
    startVisibleIndex,
  };
}
