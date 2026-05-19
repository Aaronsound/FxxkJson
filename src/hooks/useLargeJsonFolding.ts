import { useCallback, useMemo } from 'react';
import type { LargeJsonViewerData, LargeJsonViewerRegion } from '../types/jsonTool';
import { buildVisibleSegments } from '../utils/largeJsonViewerRender';
import type { CollapsedInterval } from '../utils/largeJsonViewerRender';

interface UseLargeJsonFoldingArgs {
  collapsedLines: number[];
  data: LargeJsonViewerData;
  onCollapsedLinesChange: (lines: number[]) => void;
}

export function useLargeJsonFolding({
  collapsedLines,
  data,
  onCollapsedLinesChange,
}: UseLargeJsonFoldingArgs) {
  const regionsByStartLine = useMemo(() => {
    const map = new Map<number, LargeJsonViewerRegion>();
    data.regions.forEach((region) => {
      if (!map.has(region.startLine)) {
        map.set(region.startLine, region);
      }
    });
    return map;
  }, [data.regions]);

  const normalizedCollapsedLines = useMemo(() => {
    const uniqueLines = new Set<number>();
    collapsedLines.forEach((line) => {
      if (regionsByStartLine.has(line)) {
        uniqueLines.add(line);
      }
    });

    return Array.from(uniqueLines).sort((left, right) => left - right);
  }, [collapsedLines, regionsByStartLine]);

  const collapsedIntervals = useMemo<CollapsedInterval[]>(() => {
    const intervals: CollapsedInterval[] = [];

    normalizedCollapsedLines.forEach((startLine) => {
      const region = regionsByStartLine.get(startLine);
      if (!region) {
        return;
      }

      const interval = {
        start: startLine + 1,
        end: region.endLine - 1,
        triggerLine: startLine,
      };

      if (interval.start > interval.end) {
        return;
      }

      const previous = intervals[intervals.length - 1];
      if (!previous) {
        intervals.push(interval);
        return;
      }

      if (interval.start <= previous.end) {
        previous.end = Math.max(previous.end, interval.end);
        return;
      }

      intervals.push(interval);
    });

    return intervals;
  }, [normalizedCollapsedLines, regionsByStartLine]);

  const visibleSegments = useMemo(
    () => buildVisibleSegments(data.lineCount, collapsedIntervals),
    [collapsedIntervals, data.lineCount]
  );

  const visibleLineCount = useMemo(() => (
    visibleSegments.length === 0
      ? 0
      : visibleSegments[visibleSegments.length - 1].visibleEnd + 1
  ), [visibleSegments]);

  const collapsedLineSet = useMemo(() => new Set(normalizedCollapsedLines), [normalizedCollapsedLines]);

  const toggleLine = useCallback((lineNumber: number) => {
    if (!regionsByStartLine.has(lineNumber)) {
      return;
    }

    const next = new Set(collapsedLineSet);
    if (next.has(lineNumber)) {
      next.delete(lineNumber);
    } else {
      next.add(lineNumber);
    }

    onCollapsedLinesChange(Array.from(next).sort((left, right) => left - right));
  }, [collapsedLineSet, onCollapsedLinesChange, regionsByStartLine]);

  const foldAll = useCallback(() => {
    onCollapsedLinesChange(data.regions.map((region) => region.startLine));
  }, [data.regions, onCollapsedLinesChange]);

  const unfoldAll = useCallback(() => {
    onCollapsedLinesChange([]);
  }, [onCollapsedLinesChange]);

  return {
    collapsedIntervals,
    collapsedLineSet,
    foldAll,
    normalizedCollapsedLines,
    regionsByStartLine,
    toggleLine,
    unfoldAll,
    visibleLineCount,
    visibleSegments,
  };
}
