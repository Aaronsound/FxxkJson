import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LargeRawViewerData } from '../types/jsonTool';
import {
  buildLargeRawViewerData,
  findRawSegmentIndex,
} from '../utils/largeRawViewerData';

const LINE_HEIGHT = 19;
const OVERSCAN = 20;
const APPROX_CHAR_WIDTH = 7.7;
const REVEAL_CONTEXT_CHARS = 24;

interface RawHighlightRange {
  start: number;
  end: number;
}

interface LargeRawReadonlyViewerProps {
  text: string;
  data?: LargeRawViewerData | null;
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
>(({ text, data, isDarkMode, highlightRange }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const segments = useMemo(() => data ?? buildLargeRawViewerData(text), [data, text]);
  const rowCount = segments.rowCount;

  useImperativeHandle(ref, () => ({
    focus() {
      containerRef.current?.focus({ preventScroll: true });
    },
    revealRange(startOffset) {
      const safeOffset = clamp(startOffset, 0, text.length);
      const rowIndex = findRawSegmentIndex(segments, safeOffset);
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
  }), [segments, text.length]);

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
