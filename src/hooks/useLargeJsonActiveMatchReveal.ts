import { useEffect, useRef, type RefObject } from 'react';
import type { LargeJsonSearchMatch } from '../types/jsonTool';

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
  normalizedCollapsedLines: number[];
  onCollapsedLinesChange: (lines: number[]) => void;
  onLocateOffset: (offset: number) => void;
  rowHeight: number;
}

export function useLargeJsonActiveMatchReveal({
  activeMatch,
  collapsedIntervals,
  containerRef,
  getVisibleIndexForActualLine,
  normalizedCollapsedLines,
  onCollapsedLinesChange,
  onLocateOffset,
  rowHeight,
}: UseLargeJsonActiveMatchRevealArgs) {
  const onCollapsedLinesChangeRef = useRef(onCollapsedLinesChange);
  const onLocateOffsetRef = useRef(onLocateOffset);

  useEffect(() => {
    onCollapsedLinesChangeRef.current = onCollapsedLinesChange;
    onLocateOffsetRef.current = onLocateOffset;
  }, [onCollapsedLinesChange, onLocateOffset]);

  useEffect(() => {
    if (!activeMatch) {
      return;
    }

    const containingCollapsedRegion = collapsedIntervals.find(
      (interval) => activeMatch.lineNumber >= interval.start && activeMatch.lineNumber <= interval.end
    );

    if (containingCollapsedRegion) {
      const next = normalizedCollapsedLines.filter((line) => line !== containingCollapsedRegion.triggerLine);
      onCollapsedLinesChangeRef.current(next);
      return;
    }

    const visibleIndex = getVisibleIndexForActualLine(activeMatch.lineNumber);
    if (visibleIndex !== null && containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, (visibleIndex - 3) * rowHeight);
    }

    onLocateOffsetRef.current(activeMatch.start);
  }, [
    activeMatch,
    collapsedIntervals,
    containerRef,
    getVisibleIndexForActualLine,
    normalizedCollapsedLines,
    rowHeight,
  ]);
}
