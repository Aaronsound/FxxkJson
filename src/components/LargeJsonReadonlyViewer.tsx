import React, {
  forwardRef,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LargeJsonViewerData, LargeJsonViewerRegion } from '../types/jsonTool';
import {
  findSearchMatchesInLargeJson,
  LargeJsonSearchMatch,
} from '../utils/largeJsonViewerData';

const LINE_HEIGHT = 22;
const OVERSCAN = 30;

interface LargeJsonReadonlyViewerProps {
  text: string;
  data: LargeJsonViewerData;
  isDarkMode: boolean;
  wrapLongLines: boolean;
  collapsedLines: number[];
  searchTerm: string;
  activeMatchIndex: number;
  onCollapsedLinesChange: (lines: number[]) => void;
  onMatchCountChange: (count: number) => void;
  onLocateOffset: (offset: number) => void;
  onCopyValue: (offset: number) => void | Promise<void>;
}

export interface LargeJsonReadonlyViewerHandle {
  foldAll: () => void;
  unfoldAll: () => void;
}

interface VisibleSegment {
  actualStart: number;
  actualEnd: number;
  visibleStart: number;
  visibleEnd: number;
}

function getCollapsedPreview(lineText: string, region: LargeJsonViewerRegion) {
  const trimmedEnd = lineText.replace(/\s+$/, '');
  const closing = region.kind === 'array' ? ']' : '}';
  return `${trimmedEnd} ... ${closing}`;
}

function binarySearchSegment(segments: VisibleSegment[], visibleIndex: number) {
  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = segments[mid];

    if (visibleIndex < current.visibleStart) {
      high = mid - 1;
      continue;
    }

    if (visibleIndex > current.visibleEnd) {
      low = mid + 1;
      continue;
    }

    return current;
  }

  return null;
}

const LargeJsonReadonlyViewer = forwardRef<
  LargeJsonReadonlyViewerHandle,
  LargeJsonReadonlyViewerProps
>(({
  text,
  data,
  isDarkMode,
  wrapLongLines,
  collapsedLines,
  searchTerm,
  activeMatchIndex,
  onCollapsedLinesChange,
  onMatchCountChange,
  onLocateOffset,
  onCopyValue,
}, ref) => {
  void wrapLongLines;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; offset: number } | null>(null);

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

  const collapsedIntervals = useMemo(() => {
    const intervals: Array<{ start: number; end: number; triggerLine: number }> = [];

    normalizedCollapsedLines.forEach((startLine) => {
      const region = regionsByStartLine.get(startLine);
      if (!region) {
        return;
      }

      const interval = {
        start: startLine + 1,
        end: region.endLine,
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

  const visibleSegments = useMemo(() => {
    const segments: VisibleSegment[] = [];
    let actualLine = 1;
    let visibleLine = 0;

    collapsedIntervals.forEach((interval) => {
      if (actualLine <= interval.start - 1) {
        const actualStart = actualLine;
        const actualEnd = interval.start - 1;
        const length = actualEnd - actualStart + 1;

        segments.push({
          actualStart,
          actualEnd,
          visibleStart: visibleLine,
          visibleEnd: visibleLine + length - 1,
        });
        visibleLine += length;
      }

      actualLine = Math.max(actualLine, interval.end + 1);
    });

    if (actualLine <= data.lineCount) {
      const length = data.lineCount - actualLine + 1;
      segments.push({
        actualStart: actualLine,
        actualEnd: data.lineCount,
        visibleStart: visibleLine,
        visibleEnd: visibleLine + length - 1,
      });
    }

    return segments;
  }, [collapsedIntervals, data.lineCount]);

  const visibleLineCount = useMemo(() => (
    visibleSegments.length === 0
      ? 0
      : visibleSegments[visibleSegments.length - 1].visibleEnd + 1
  ), [visibleSegments]);

  const collapsedLineSet = useMemo(() => new Set(normalizedCollapsedLines), [normalizedCollapsedLines]);

  const getLineText = useCallback((lineNumber: number) => {
    const start = data.lineStarts[lineNumber - 1] ?? 0;
    const end = lineNumber < data.lineCount
      ? Math.max(start, (data.lineStarts[lineNumber] ?? text.length) - 1)
      : text.length;
    let value = text.slice(start, end);
    if (value.endsWith('\r')) {
      value = value.slice(0, -1);
    }
    return value;
  }, [data.lineCount, data.lineStarts, text]);

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

  const resolveOffsetFromPoint = useCallback((
    event: ReactMouseEvent<HTMLElement>,
    lineNumber: number,
    lineText: string
  ) => {
    const lineStartOffset = data.lineStarts[lineNumber - 1] ?? 0;
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };

    const currentTarget = event.currentTarget;
    let charOffset = 0;

    const caretPosition = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (caretPosition && currentTarget.contains(caretPosition.offsetNode)) {
      charOffset = caretPosition.offset;
    } else {
      const caretRange = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (caretRange && currentTarget.contains(caretRange.startContainer)) {
        charOffset = caretRange.startOffset;
      } else if (
        event.target instanceof HTMLElement
        && event.target.classList.contains('large-json-line-text')
      ) {
        charOffset = lineText.length;
      }
    }

    return lineStartOffset + Math.max(0, Math.min(charOffset, lineText.length));
  }, [data.lineStarts]);

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

  const searchMatches = useMemo(() => (
    findSearchMatchesInLargeJson(text, data.lineStarts, data.lineCount, searchTerm)
  ), [data.lineCount, data.lineStarts, searchTerm, text]);

  const matchesByLine = useMemo(() => {
    const map = new Map<number, Array<LargeJsonSearchMatch & { matchIndex: number }>>();

    searchMatches.forEach((match, index) => {
      const lineMatches = map.get(match.lineNumber) ?? [];
      lineMatches.push({
        ...match,
        matchIndex: index,
      });
      map.set(match.lineNumber, lineMatches);
    });

    return map;
  }, [searchMatches]);

  const effectiveMatchIndex = searchMatches.length > 0
    ? ((activeMatchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length
    : 0;
  const activeMatch = searchMatches[effectiveMatchIndex] ?? null;

  useImperativeHandle(ref, () => ({
    foldAll() {
      onCollapsedLinesChange(data.regions.map((region) => region.startLine));
    },
    unfoldAll() {
      onCollapsedLinesChange([]);
    },
  }), [data.regions, onCollapsedLinesChange]);

  useEffect(() => {
    onMatchCountChange(searchMatches.length);
  }, [onMatchCountChange, searchMatches.length]);

  useEffect(() => {
    setContextMenu(null);
  }, [searchTerm]);

  useEffect(() => {
    if (!activeMatch) {
      return;
    }

    const containingCollapsedRegion = collapsedIntervals.find((interval) => (
      activeMatch.lineNumber >= interval.start && activeMatch.lineNumber <= interval.end
    ));

    if (containingCollapsedRegion) {
      const next = normalizedCollapsedLines.filter((line) => line !== containingCollapsedRegion.triggerLine);
      onCollapsedLinesChange(next);
      return;
    }

    const visibleIndex = getVisibleIndexForActualLine(activeMatch.lineNumber);
    if (visibleIndex !== null && containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, (visibleIndex - 3) * LINE_HEIGHT);
    }

    onLocateOffset(activeMatch.start);
  }, [
    activeMatch,
    collapsedIntervals,
    getVisibleIndexForActualLine,
    normalizedCollapsedLines,
    onCollapsedLinesChange,
    onLocateOffset,
  ]);

  useEffect(() => {
    const handleGlobalPointer = () => setContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('pointerdown', handleGlobalPointer);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const syncSize = () => {
      setViewportHeight(container.clientHeight);
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const startVisibleIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
  const endVisibleIndex = Math.min(
    Math.max(0, visibleLineCount - 1),
    Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + OVERSCAN
  );

  const renderLineText = useCallback((lineNumber: number, lineText: string) => {
    const lineMatches = matchesByLine.get(lineNumber);
    if (!lineMatches || lineMatches.length === 0) {
      return lineText;
    }

    const children: React.ReactNode[] = [];
    let cursor = 0;

    lineMatches.forEach((match) => {
      const localStart = Math.max(0, Math.min(match.localStart, lineText.length));
      const localEnd = Math.max(localStart, Math.min(match.localEnd, lineText.length));

      if (cursor < localStart) {
        children.push(
          <React.Fragment key={`plain-${lineNumber}-${cursor}`}>
            {lineText.slice(cursor, localStart)}
          </React.Fragment>
        );
      }

      children.push(
        <mark
          key={`match-${lineNumber}-${match.matchIndex}`}
          className={`large-json-search-match ${match.matchIndex === effectiveMatchIndex ? 'active' : ''}`}
        >
          {lineText.slice(localStart, localEnd)}
        </mark>
      );
      cursor = localEnd;
    });

    if (cursor < lineText.length) {
      children.push(
        <React.Fragment key={`tail-${lineNumber}-${cursor}`}>
          {lineText.slice(cursor)}
        </React.Fragment>
      );
    }

    return children;
  }, [effectiveMatchIndex, matchesByLine]);

  const renderedRows = [];

  for (let visibleIndex = startVisibleIndex; visibleIndex <= endVisibleIndex; visibleIndex += 1) {
    const lineNumber = getActualLineNumber(visibleIndex);
    if (lineNumber === null) {
      continue;
    }

    const region = regionsByStartLine.get(lineNumber);
    const isCollapsed = collapsedLineSet.has(lineNumber);
    const baseLineText = getLineText(lineNumber);
    const lineText = region && isCollapsed
      ? getCollapsedPreview(baseLineText, region)
      : baseLineText;

    renderedRows.push(
      <div
        key={`${lineNumber}-${visibleIndex}`}
        className="large-json-row"
        style={{
          top: `${visibleIndex * LINE_HEIGHT}px`,
          height: `${LINE_HEIGHT}px`,
        }}
      >
        <button
          type="button"
          className={`large-json-fold-button ${region ? 'visible' : ''}`}
          onClick={() => toggleLine(lineNumber)}
          onMouseDown={(event) => event.preventDefault()}
          disabled={!region}
          aria-label={isCollapsed ? 'Expand node' : 'Collapse node'}
        >
          {region ? (isCollapsed ? '▶' : '▼') : ''}
        </button>
        <span className="large-json-line-number">{lineNumber}</span>
        <span
          className="large-json-line-text"
          title={lineText}
          onMouseUp={(event) => {
            if (event.button !== 0) {
              return;
            }

            const offset = resolveOffsetFromPoint(event, lineNumber, baseLineText);
            onLocateOffset(offset);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            const offset = resolveOffsetFromPoint(event, lineNumber, baseLineText);
            setContextMenu({
              x: event.clientX,
              y: event.clientY,
              offset,
            });
          }}
        >
          {renderLineText(lineNumber, lineText)}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`large-json-viewer ${isDarkMode ? 'dark' : ''}`}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        className="large-json-spacer"
        style={{ height: `${Math.max(visibleLineCount, 1) * LINE_HEIGHT}px` }}
      >
        {renderedRows}
      </div>
      {contextMenu && (
        <div
          className={`large-json-context-menu ${isDarkMode ? 'dark' : ''}`}
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="large-json-context-menu-item"
            onClick={async () => {
              await onCopyValue(contextMenu.offset);
              setContextMenu(null);
            }}
          >
            Copy value
          </button>
        </div>
      )}
    </div>
  );
});

LargeJsonReadonlyViewer.displayName = 'LargeJsonReadonlyViewer';

export default LargeJsonReadonlyViewer;
