import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

const CHUNK_SIZE = 2000;
const LINE_HEIGHT = 18;
const OVERSCAN = 20;
const APPROX_CHAR_WIDTH = 7.25;
const REVEAL_CONTEXT_CHARS = 24;

interface RawHighlightRange {
  start: number;
  end: number;
}

interface LargeRawReadonlyViewerProps {
  text: string;
  isDarkMode: boolean;
  highlightRange: RawHighlightRange | null;
}

export interface LargeRawReadonlyViewerHandle {
  focus: () => void;
  revealRange: (startOffset: number, endOffset: number) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildRawViewerSegments(text: string) {
  if (!text) {
    return {
      starts: Uint32Array.from([0]),
      ends: Uint32Array.from([0]),
    };
  }

  const starts: number[] = [];
  const ends: number[] = [];
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;

    if (lineStart === lineEnd) {
      starts.push(lineStart);
      ends.push(lineEnd);
    } else {
      let segmentStart = lineStart;
      while (segmentStart < lineEnd) {
        const segmentEnd = Math.min(lineEnd, segmentStart + CHUNK_SIZE);
        starts.push(segmentStart);
        ends.push(segmentEnd);
        segmentStart = segmentEnd;
      }
    }

    if (newlineIndex === -1) {
      break;
    }

    lineStart = newlineIndex + 1;
    if (lineStart === text.length) {
      starts.push(lineStart);
      ends.push(lineStart);
      break;
    }
  }

  return {
    starts: Uint32Array.from(starts),
    ends: Uint32Array.from(ends),
  };
}

function findSegmentIndex(starts: Uint32Array, ends: Uint32Array, offset: number) {
  let low = 0;
  let high = starts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = starts[mid];

    if (value <= offset) {
      result = mid;
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  if (offset > (ends[result] ?? 0) && result < starts.length - 1) {
    return result + 1;
  }

  return result;
}

function renderChunkText(
  text: string,
  chunkStart: number,
  chunkEnd: number,
  highlightRange: RawHighlightRange | null
) {
  const chunkText = text.slice(chunkStart, chunkEnd);
  if (
    !highlightRange
    || highlightRange.end <= chunkStart
    || highlightRange.start >= chunkEnd
  ) {
    return chunkText;
  }

  const localStart = clamp(highlightRange.start - chunkStart, 0, chunkText.length);
  const localEnd = clamp(highlightRange.end - chunkStart, localStart, chunkText.length);

  return (
    <>
      {chunkText.slice(0, localStart)}
      <mark className="large-raw-highlight">
        {chunkText.slice(localStart, localEnd)}
      </mark>
      {chunkText.slice(localEnd)}
    </>
  );
}

const LargeRawReadonlyViewer = forwardRef<
  LargeRawReadonlyViewerHandle,
  LargeRawReadonlyViewerProps
>(({ text, isDarkMode, highlightRange }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const segments = useMemo(() => buildRawViewerSegments(text), [text]);
  const rowCount = segments.starts.length;

  useImperativeHandle(ref, () => ({
    focus() {
      containerRef.current?.focus({ preventScroll: true });
    },
    revealRange(startOffset) {
      const safeOffset = clamp(startOffset, 0, text.length);
      const rowIndex = findSegmentIndex(segments.starts, segments.ends, safeOffset);
      const rowStart = segments.starts[rowIndex] ?? 0;
      const rowEnd = segments.ends[rowIndex] ?? rowStart;
      const localStart = clamp(safeOffset - rowStart, 0, Math.max(0, rowEnd - rowStart));
      const nextScrollTop = Math.max(0, (rowIndex - 3) * LINE_HEIGHT);
      const nextScrollLeft = Math.max(0, (localStart - REVEAL_CONTEXT_CHARS) * APPROX_CHAR_WIDTH);
      const revealHorizontal = () => {
        if (containerRef.current) {
          containerRef.current.scrollLeft = nextScrollLeft;
        }
      };

      if (containerRef.current) {
        containerRef.current.scrollTop = nextScrollTop;
      }
      setScrollTop(nextScrollTop);
      revealHorizontal();
      window.requestAnimationFrame(revealHorizontal);
    },
  }), [segments.ends, segments.starts, text.length]);

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

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
    const end = Math.min(
      rowCount - 1,
      Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + OVERSCAN
    );

    return { start, end };
  }, [rowCount, scrollTop, viewportHeight]);

  const rows = [];
  for (let rowIndex = visibleRange.start; rowIndex <= visibleRange.end; rowIndex += 1) {
    const chunkStart = segments.starts[rowIndex] ?? 0;
    const chunkEnd = segments.ends[rowIndex] ?? chunkStart;
    const isHighlighted = Boolean(
      highlightRange
      && highlightRange.end > chunkStart
      && highlightRange.start < chunkEnd
    );

    rows.push(
      <div
        key={rowIndex}
        className={`large-raw-row ${isHighlighted ? 'highlighted' : ''}`}
        style={{
          top: `${rowIndex * LINE_HEIGHT}px`,
          height: `${LINE_HEIGHT}px`,
        }}
      >
        <span className="large-raw-offset">
          {chunkStart.toLocaleString()}
        </span>
        <code className="large-raw-text">
          {renderChunkText(text, chunkStart, chunkEnd, highlightRange)}
        </code>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`large-raw-viewer ${isDarkMode ? 'dark' : ''}`}
      tabIndex={0}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        className="large-raw-spacer"
        style={{ height: `${rowCount * LINE_HEIGHT}px` }}
      >
        {rows}
      </div>
    </div>
  );
});

LargeRawReadonlyViewer.displayName = 'LargeRawReadonlyViewer';

export default LargeRawReadonlyViewer;
