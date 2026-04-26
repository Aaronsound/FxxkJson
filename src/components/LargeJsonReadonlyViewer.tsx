import React, {
  ClipboardEvent as ReactClipboardEvent,
  forwardRef,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeJsonViewerRegion,
} from '../types/jsonTool';
import {
  findSearchMatchesInLargeJson,
} from '../utils/largeJsonViewerData';

const LINE_HEIGHT = 18;
const OVERSCAN = 30;

interface LargeJsonReadonlyViewerProps {
  text: string;
  data: LargeJsonViewerData;
  isDarkMode: boolean;
  wrapLongLines: boolean;
  collapsedLines: number[];
  searchTerm: string;
  searchMatches?: LargeJsonSearchMatch[];
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

interface JsonSyntaxToken {
  start: number;
  end: number;
  className?: string;
}

function getCollapsedPreview(lineText: string, region: LargeJsonViewerRegion) {
  const trimmedEnd = lineText.replace(/\s+$/, '');
  return `${trimmedEnd} ...`;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getTextOffsetWithin(root: HTMLElement, node: Node, offset: number, fallbackLength: number) {
  const range = document.createRange();

  try {
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return clamp(range.toString().length, 0, fallbackLength);
  } catch {
    return fallbackLength;
  } finally {
    range.detach();
  }
}

function getLineTextElementFromNode(node: Node, container: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement;
  const lineElement = element?.closest<HTMLElement>('.large-json-line-text') ?? null;

  if (!lineElement || !container.contains(lineElement)) {
    return null;
  }

  return lineElement;
}

function getLineNumberFromElement(element: HTMLElement) {
  const lineNumber = Number(element.dataset.lineNumber);
  return Number.isFinite(lineNumber) ? lineNumber : null;
}

function getJsonStringEnd(lineText: string, start: number) {
  let index = start + 1;
  let escaped = false;

  while (index < lineText.length) {
    const char = lineText[index];

    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      return index + 1;
    }

    index += 1;
  }

  return lineText.length;
}

function getNextNonWhitespaceIndex(lineText: string, start: number) {
  let index = start;

  while (index < lineText.length && /\s/.test(lineText[index])) {
    index += 1;
  }

  return index;
}

function tokenizeJsonLine(lineText: string): JsonSyntaxToken[] {
  const tokens: JsonSyntaxToken[] = [];
  let index = 0;

  const pushToken = (start: number, end: number, className?: string) => {
    if (end > start) {
      tokens.push({ start, end, className });
    }
  };

  while (index < lineText.length) {
    const char = lineText[index];

    if (/\s/.test(char)) {
      const start = index;
      while (index < lineText.length && /\s/.test(lineText[index])) {
        index += 1;
      }
      pushToken(start, index);
      continue;
    }

    if (char === '"') {
      const end = getJsonStringEnd(lineText, index);
      const nextNonWhitespace = getNextNonWhitespaceIndex(lineText, end);
      const className = lineText[nextNonWhitespace] === ':'
        ? 'large-json-token large-json-token-key'
        : 'large-json-token large-json-token-value large-json-token-string';

      pushToken(index, end, className);
      index = end;
      continue;
    }

    if (char === '-' || /\d/.test(char)) {
      const match = lineText.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        pushToken(
          index,
          index + match[0].length,
          'large-json-token large-json-token-value large-json-token-number'
        );
        index += match[0].length;
        continue;
      }
    }

    const literal = ['true', 'false', 'null'].find((candidate) => lineText.startsWith(candidate, index));
    if (literal) {
      pushToken(
        index,
        index + literal.length,
        'large-json-token large-json-token-value large-json-token-literal'
      );
      index += literal.length;
      continue;
    }

    if ('{}[]:,.'.includes(char)) {
      pushToken(index, index + 1, 'large-json-token large-json-token-punctuation');
      index += 1;
      continue;
    }

    pushToken(index, index + 1);
    index += 1;
  }

  return tokens;
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
  searchMatches: searchMatchesFromWorker,
  activeMatchIndex,
  onCollapsedLinesChange,
  onMatchCountChange,
  onLocateOffset,
  onCopyValue,
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; offset: number } | null>(null);
  const rowHeight = wrapLongLines ? LINE_HEIGHT * 4 : LINE_HEIGHT;

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
      charOffset = getTextOffsetWithin(
        currentTarget,
        caretPosition.offsetNode,
        caretPosition.offset,
        lineText.length
      );
    } else {
      const caretRange = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (caretRange && currentTarget.contains(caretRange.startContainer)) {
        charOffset = getTextOffsetWithin(
          currentTarget,
          caretRange.startContainer,
          caretRange.startOffset,
          lineText.length
        );
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

  const getLineRangeText = useCallback((startLine: number, endLine: number) => {
    const lines: string[] = [];
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      lines.push(getLineText(lineNumber));
    }
    return lines.join('\n');
  }, [getLineText]);

  const getCollapsedSelectionText = useCallback((lineNumber: number, startOffset: number) => {
    const region = regionsByStartLine.get(lineNumber);
    if (!region) {
      return getLineText(lineNumber);
    }

    const openChar = region.kind === 'array' ? '[' : '{';
    const closeChar = region.kind === 'array' ? ']' : '}';
    const firstLine = getLineText(lineNumber);
    const openIndex = firstLine.lastIndexOf(openChar);

    if (openIndex >= 0 && startOffset >= openIndex) {
      const lines = [firstLine.slice(openIndex)];
      for (let currentLine = lineNumber + 1; currentLine < region.endLine; currentLine += 1) {
        lines.push(getLineText(currentLine));
      }

      const closingLine = getLineText(region.endLine);
      const closeIndex = closingLine.lastIndexOf(closeChar);
      lines.push(closeIndex >= 0 ? closingLine.slice(0, closeIndex + 1) : closingLine);
      return lines.join('\n');
    }

    return getLineRangeText(lineNumber, region.endLine);
  }, [getLineRangeText, getLineText, regionsByStartLine]);

  const getCopyTextForCollapsedSelection = useCallback((
    startLine: number,
    endLine: number,
    startOffset: number,
    endOffset: number
  ) => {
    let includesCollapsedLine = false;
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      if (collapsedLineSet.has(lineNumber)) {
        includesCollapsedLine = true;
        break;
      }
    }

    if (!includesCollapsedLine) {
      return null;
    }

    if (startLine === endLine && collapsedLineSet.has(startLine)) {
      return getCollapsedSelectionText(startLine, startOffset);
    }

    const parts: string[] = [];
    let lineNumber = startLine;

    while (lineNumber <= endLine) {
      if (collapsedLineSet.has(lineNumber)) {
        const region = regionsByStartLine.get(lineNumber);
        if (region) {
          parts.push(getLineRangeText(lineNumber, region.endLine));
          lineNumber = region.endLine + 1;
          continue;
        }
      }

      let lineText = getLineText(lineNumber);
      if (lineNumber === startLine) {
        lineText = lineText.slice(startOffset);
      }
      if (lineNumber === endLine) {
        lineText = lineText.slice(0, endOffset);
      }
      parts.push(lineText);
      lineNumber += 1;
    }

    return parts.join('\n');
  }, [
    collapsedLineSet,
    getCollapsedSelectionText,
    getLineRangeText,
    getLineText,
    regionsByStartLine,
  ]);

  const handleCopy = useCallback((event: ReactClipboardEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const startElement = getLineTextElementFromNode(range.startContainer, container);
    const endElement = getLineTextElementFromNode(range.endContainer, container);
    if (!startElement || !endElement) {
      return;
    }

    const startLine = getLineNumberFromElement(startElement);
    const endLine = getLineNumberFromElement(endElement);
    if (startLine === null || endLine === null || startLine > endLine) {
      return;
    }

    const startOffset = getTextOffsetWithin(
      startElement,
      range.startContainer,
      range.startOffset,
      startElement.textContent?.length ?? 0
    );
    const endOffset = getTextOffsetWithin(
      endElement,
      range.endContainer,
      range.endOffset,
      endElement.textContent?.length ?? 0
    );
    const copyText = getCopyTextForCollapsedSelection(startLine, endLine, startOffset, endOffset);

    if (copyText === null) {
      return;
    }

    event.preventDefault();
    event.clipboardData.setData('text/plain', copyText);
  }, [getCopyTextForCollapsedSelection]);

  const searchMatches = useMemo(() => (
    searchMatchesFromWorker
      ?? findSearchMatchesInLargeJson(text, data.lineStarts, data.lineCount, searchTerm)
  ), [data.lineCount, data.lineStarts, searchMatchesFromWorker, searchTerm, text]);

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
      containerRef.current.scrollTop = Math.max(0, (visibleIndex - 3) * rowHeight);
    }

    onLocateOffset(activeMatch.start);
  }, [
    activeMatch,
    collapsedIntervals,
    getVisibleIndexForActualLine,
    normalizedCollapsedLines,
    onCollapsedLinesChange,
    onLocateOffset,
    rowHeight,
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

  const startVisibleIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const endVisibleIndex = Math.min(
    Math.max(0, visibleLineCount - 1),
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN
  );
  const lineNumberWidth = `${Math.max(3, String(data.lineCount).length)}ch`;

  const renderLineText = useCallback((lineNumber: number, lineText: string) => {
    const lineMatches = (matchesByLine.get(lineNumber) ?? [])
      .map((match) => ({
        ...match,
        localStart: clamp(match.localStart, 0, lineText.length),
        localEnd: clamp(match.localEnd, 0, lineText.length),
      }))
      .filter((match) => match.localEnd > match.localStart)
      .sort((left, right) => left.localStart - right.localStart);
    const syntaxTokens = tokenizeJsonLine(lineText);
    const children: React.ReactNode[] = [];
    let matchCursor = 0;
    let partIndex = 0;

    const pushSegment = (
      start: number,
      end: number,
      className?: string,
      match?: LargeJsonSearchMatch & { matchIndex: number }
    ) => {
      if (end <= start) {
        return;
      }

      const segmentText = lineText.slice(start, end);
      const key = `${lineNumber}-${partIndex}`;
      partIndex += 1;
      const content = className ? (
        <span className={className}>{segmentText}</span>
      ) : (
        <React.Fragment>{segmentText}</React.Fragment>
      );

      if (!match) {
        children.push(
          className ? (
            <span key={key} className={className}>{segmentText}</span>
          ) : (
            <React.Fragment key={key}>{segmentText}</React.Fragment>
          )
        );
        return;
      }

      children.push(
        <mark
          key={key}
          className={`large-json-search-match ${match.matchIndex === effectiveMatchIndex ? 'active' : ''}`}
        >
          {content}
        </mark>
      );
    };

    syntaxTokens.forEach((token) => {
      let cursor = token.start;

      while (cursor < token.end) {
        while (matchCursor < lineMatches.length && lineMatches[matchCursor].localEnd <= cursor) {
          matchCursor += 1;
        }

        const match = lineMatches[matchCursor];
        if (!match || match.localStart >= token.end) {
          pushSegment(cursor, token.end, token.className);
          break;
        }

        if (cursor < match.localStart) {
          const segmentEnd = Math.min(match.localStart, token.end);
          pushSegment(cursor, segmentEnd, token.className);
          cursor = segmentEnd;
          continue;
        }

        const segmentEnd = Math.min(match.localEnd, token.end);
        pushSegment(cursor, segmentEnd, token.className, match);
        cursor = segmentEnd;
      }
    });

    if (children.length === 0) {
      return lineText;
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
        className={`large-json-row ${wrapLongLines ? 'wrap' : ''}`}
        style={{
          top: `${visibleIndex * rowHeight}px`,
          height: `${rowHeight}px`,
        }}
      >
        <span
          className="large-json-line-number"
          style={{ width: lineNumberWidth }}
        >
          {lineNumber}
        </span>
        <button
          type="button"
          className={`large-json-fold-button ${region ? 'visible' : ''} ${isCollapsed ? 'collapsed' : 'expanded'}`}
          onClick={() => toggleLine(lineNumber)}
          onMouseDown={(event) => event.preventDefault()}
          disabled={!region}
          aria-label={isCollapsed ? 'Expand node' : 'Collapse node'}
        />
        <span
          className={`large-json-line-text ${wrapLongLines ? 'wrap' : ''}`}
          data-line-number={lineNumber}
          data-collapsed={isCollapsed ? 'true' : undefined}
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
      onCopy={handleCopy}
    >
      <div
        className="large-json-spacer"
        style={{ height: `${Math.max(visibleLineCount, 1) * rowHeight}px` }}
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
