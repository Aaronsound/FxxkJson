import { useCallback, useMemo } from 'react';
import type { LargeJsonFoldState, LargeJsonViewerData } from '../types/jsonTool';
import { findFirstRegionIndexAtStartLine, getLargeJsonViewerRegionAtStartLine } from '../utils/largeJsonViewerData';
import { buildAllExceptCollapsedIntervals, buildVisibleSegments } from '../utils/largeJsonViewerRender';
import type { CollapsedInterval } from '../utils/largeJsonViewerRender';

interface UseLargeJsonFoldingArgs {
  foldState: LargeJsonFoldState;
  data: LargeJsonViewerData;
  onFoldStateChange: (state: LargeJsonFoldState) => void;
}

export function useLargeJsonFolding({ foldState, data, onFoldStateChange }: UseLargeJsonFoldingArgs) {
  const getRegionByStartLine = useCallback(
    (lineNumber: number) => getLargeJsonViewerRegionAtStartLine(data.regions, lineNumber) ?? undefined,
    [data.regions]
  );

  const normalizedStateLines = useMemo(() => {
    const uniqueLines = new Set<number>();
    foldState.lines.forEach((line) => {
      if (findFirstRegionIndexAtStartLine(data.regions, line) >= 0) {
        uniqueLines.add(line);
      }
    });

    return Array.from(uniqueLines).sort((left, right) => left - right);
  }, [data.regions, foldState.lines]);

  const stateLineSet = useMemo(() => new Set(normalizedStateLines), [normalizedStateLines]);

  const isRegionCollapsed = useCallback(
    (lineNumber: number) =>
      foldState.mode === 'all-except' ? !stateLineSet.has(lineNumber) : stateLineSet.has(lineNumber),
    [foldState.mode, stateLineSet]
  );

  const isLineCollapsed = useCallback(
    (lineNumber: number) => {
      if (findFirstRegionIndexAtStartLine(data.regions, lineNumber) < 0) {
        return false;
      }
      return isRegionCollapsed(lineNumber);
    },
    [data.regions, isRegionCollapsed]
  );

  const collapsedIntervals = useMemo<CollapsedInterval[]>(() => {
    const intervals: CollapsedInterval[] = [];

    const appendInterval = (startLine: number, endLine: number) => {
      const interval = {
        start: startLine + 1,
        end: endLine - 1,
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
    };

    if (foldState.mode === 'explicit') {
      normalizedStateLines.forEach((startLine) => {
        const region = getLargeJsonViewerRegionAtStartLine(data.regions, startLine);
        if (region) {
          appendInterval(startLine, region.endLine);
        }
      });
      return intervals;
    }

    return buildAllExceptCollapsedIntervals(data.regions, stateLineSet);
  }, [data.regions, foldState.mode, normalizedStateLines, stateLineSet]);

  const visibleSegments = useMemo(
    () => buildVisibleSegments(data.lineCount, collapsedIntervals),
    [collapsedIntervals, data.lineCount]
  );

  const visibleLineCount = useMemo(
    () => (visibleSegments.length === 0 ? 0 : visibleSegments[visibleSegments.length - 1].visibleEnd + 1),
    [visibleSegments]
  );

  const expandLine = useCallback(
    (lineNumber: number) => {
      if (!isLineCollapsed(lineNumber)) {
        return;
      }

      if (foldState.mode === 'all-except') {
        onFoldStateChange({ mode: 'all-except', lines: [...normalizedStateLines, lineNumber].sort((a, b) => a - b) });
        return;
      }

      onFoldStateChange({ mode: 'explicit', lines: normalizedStateLines.filter((line) => line !== lineNumber) });
    },
    [foldState.mode, isLineCollapsed, normalizedStateLines, onFoldStateChange]
  );

  const toggleLine = useCallback(
    (lineNumber: number) => {
      if (findFirstRegionIndexAtStartLine(data.regions, lineNumber) < 0) {
        return;
      }

      if (isLineCollapsed(lineNumber)) {
        expandLine(lineNumber);
        return;
      }

      if (foldState.mode === 'all-except') {
        onFoldStateChange({ mode: 'all-except', lines: normalizedStateLines.filter((line) => line !== lineNumber) });
        return;
      }

      onFoldStateChange({ mode: 'explicit', lines: [...normalizedStateLines, lineNumber].sort((a, b) => a - b) });
    },
    [data.regions, expandLine, foldState.mode, isLineCollapsed, normalizedStateLines, onFoldStateChange]
  );

  const foldAll = useCallback(() => {
    onFoldStateChange({ mode: 'all-except', lines: [] });
  }, [onFoldStateChange]);

  const unfoldAll = useCallback(() => {
    onFoldStateChange({ mode: 'explicit', lines: [] });
  }, [onFoldStateChange]);

  return {
    collapsedIntervals,
    expandLine,
    foldAll,
    getRegionByStartLine,
    isLineCollapsed,
    isRegionCollapsed,
    normalizedStateLines,
    toggleLine,
    unfoldAll,
    visibleLineCount,
    visibleSegments,
  };
}
