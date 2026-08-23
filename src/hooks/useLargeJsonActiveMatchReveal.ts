import { useEffect, useRef, type RefObject } from 'react';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import { findCollapsedInterval } from '../utils/largeJsonViewerRender';

interface CollapsedInterval {
  start: number;
  end: number;
  triggerLine: number;
}

interface UseLargeJsonActiveMatchRevealArgs {
  activeMatch: LargeJsonSearchMatch | null;
  collapsedIntervals: CollapsedInterval[];
  containerRef: RefObject<HTMLDivElement | null>;
  getVisibleIndexForActualLine: (lineNumber: number) => number | null;
  getRowTop: (visibleIndex: number) => number;
  onExpandCollapsedLine: (lineNumber: number) => void;
  onLocateOffset: (offset: number) => void;
}

export function useLargeJsonActiveMatchReveal({
  activeMatch,
  collapsedIntervals,
  containerRef,
  getVisibleIndexForActualLine,
  getRowTop,
  onExpandCollapsedLine,
  onLocateOffset,
}: UseLargeJsonActiveMatchRevealArgs) {
  const onExpandCollapsedLineRef = useRef(onExpandCollapsedLine);
  const onLocateOffsetRef = useRef(onLocateOffset);

  useEffect(() => {
    onExpandCollapsedLineRef.current = onExpandCollapsedLine;
    onLocateOffsetRef.current = onLocateOffset;
  }, [onExpandCollapsedLine, onLocateOffset]);

  useEffect(() => {
    if (!activeMatch) {
      return;
    }

    const containingCollapsedRegion = findCollapsedInterval(collapsedIntervals, activeMatch.lineNumber);

    if (containingCollapsedRegion) {
      onExpandCollapsedLineRef.current(containingCollapsedRegion.triggerLine);
      return;
    }

    const visibleIndex = getVisibleIndexForActualLine(activeMatch.lineNumber);
    if (visibleIndex !== null && containerRef.current) {
      containerRef.current.scrollTop = getRowTop(Math.max(0, visibleIndex - 3));
    }

    onLocateOffsetRef.current(activeMatch.start);
  }, [activeMatch, collapsedIntervals, containerRef, getVisibleIndexForActualLine, getRowTop]);
}
