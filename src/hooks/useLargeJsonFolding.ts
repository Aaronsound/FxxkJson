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

function findSortedNumberIndex(lines: number[], lineNumber: number) {
  let low = 0;
  let high = lines.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle] < lineNumber) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function insertSortedFoldLine(lines: number[], lineNumber: number) {
  const index = findSortedNumberIndex(lines, lineNumber);
  if (lines[index] === lineNumber) {
    return lines;
  }

  return [...lines.slice(0, index), lineNumber, ...lines.slice(index)];
}

export function removeSortedFoldLine(lines: number[], lineNumber: number) {
  const index = findSortedNumberIndex(lines, lineNumber);
  if (lines[index] !== lineNumber) {
    return lines;
  }

  return [...lines.slice(0, index), ...lines.slice(index + 1)];
}

export function useLargeJsonFolding({ foldState, data, onFoldStateChange }: UseLargeJsonFoldingArgs) {
  const getRegionByStartLine = useCallback(
    (lineNumber: number) => getLargeJsonViewerRegionAtStartLine(data.regions, lineNumber) ?? undefined,
    [data.regions]
  );

  const getRegionEndLineByStartLine = useCallback(
    (lineNumber: number) => {
      const regionIndex = findFirstRegionIndexAtStartLine(data.regions, lineNumber);
      return regionIndex >= 0 ? data.regions.endLines[regionIndex] : null;
    },
    [data.regions]
  );

  const normalizedState = useMemo(() => {
    const candidateLines = Array.from(new Set(foldState.lines)).sort((left, right) => left - right);
    const lines: number[] = [];
    const regionIndexes: number[] = [];

    candidateLines.forEach((line) => {
      const regionIndex = findFirstRegionIndexAtStartLine(data.regions, line);
      if (regionIndex >= 0) {
        lines.push(line);
        regionIndexes.push(regionIndex);
      }
    });

    return { lines, regionIndexes };
  }, [data.regions, foldState.lines]);
  const normalizedStateLines = normalizedState.lines;

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
      normalizedStateLines.forEach((startLine, stateIndex) => {
        appendInterval(startLine, data.regions.endLines[normalizedState.regionIndexes[stateIndex]]);
      });
      return intervals;
    }

    return buildAllExceptCollapsedIntervals(data.regions, stateLineSet);
  }, [data.regions, foldState.mode, normalizedState, normalizedStateLines, stateLineSet]);

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
        onFoldStateChange({ mode: 'all-except', lines: insertSortedFoldLine(normalizedStateLines, lineNumber) });
        return;
      }

      onFoldStateChange({ mode: 'explicit', lines: removeSortedFoldLine(normalizedStateLines, lineNumber) });
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
        onFoldStateChange({ mode: 'all-except', lines: removeSortedFoldLine(normalizedStateLines, lineNumber) });
        return;
      }

      onFoldStateChange({ mode: 'explicit', lines: insertSortedFoldLine(normalizedStateLines, lineNumber) });
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
    getRegionEndLineByStartLine,
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
