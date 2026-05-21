import React, { useCallback, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { LargeRawViewerData } from '../types/jsonTool';
import { buildLargeRawViewerData, findRawSegmentIndex } from '../utils/largeRawViewerData';

const LINE_HEIGHT = 19;
const OVERSCAN = 20;
const APPROX_CHAR_WIDTH = 7.7;
const REVEAL_CONTEXT_CHARS = 24;
const STICKY_OFFSET_WIDTH = 88;
const PRECISE_REVEAL_PADDING = 24;

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

function renderChunkText(text: string, chunkStart: number, chunkEnd: number, highlightRange: RawHighlightRange | null) {
  const chunkText = text.slice(chunkStart, chunkEnd);
  if (!highlightRange || highlightRange.end <= chunkStart || highlightRange.start >= chunkEnd) {
    return chunkText;
  }

  const localStart = clamp(highlightRange.start - chunkStart, 0, chunkText.length);
  const localEnd = clamp(highlightRange.end - chunkStart, localStart, chunkText.length);

  return (
    <>
      {chunkText.slice(0, localStart)}
      <mark className="large-raw-highlight" data-large-raw-highlight="true">
        {chunkText.slice(localStart, localEnd)}
      </mark>
      {chunkText.slice(localEnd)}
    </>
  );
}

const LargeRawReadonlyViewer = forwardRef<LargeRawReadonlyViewerHandle, LargeRawReadonlyViewerProps>(
  ({ text, data, isDarkMode, highlightRange }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pendingRevealRef = useRef<RawHighlightRange | null>(null);
    const revealFrameRef = useRef<number | null>(null);
    const revealFollowupFrameRef = useRef<number | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const segments = useMemo(() => data ?? buildLargeRawViewerData(text), [data, text]);
    const rowCount = segments.rowCount;

    const cancelPreciseReveal = useCallback(() => {
      if (revealFrameRef.current !== null) {
        window.cancelAnimationFrame(revealFrameRef.current);
        revealFrameRef.current = null;
      }

      if (revealFollowupFrameRef.current !== null) {
        window.cancelAnimationFrame(revealFollowupFrameRef.current);
        revealFollowupFrameRef.current = null;
      }
    }, []);

    const revealHighlightedMarkPrecisely = useCallback(() => {
      const container = containerRef.current;
      const highlight = container?.querySelector<HTMLElement>('[data-large-raw-highlight="true"]');

      if (!container || !highlight) {
        return false;
      }

      const containerRect = container.getBoundingClientRect();
      const highlightRect = highlight.getBoundingClientRect();

      if (containerRect.width <= 0 || highlightRect.width <= 0) {
        return false;
      }

      const visibleLeft = containerRect.left + STICKY_OFFSET_WIDTH + PRECISE_REVEAL_PADDING;
      const visibleRight = containerRect.right - PRECISE_REVEAL_PADDING;
      let nextScrollLeft = container.scrollLeft;

      if (highlightRect.left < visibleLeft) {
        nextScrollLeft += highlightRect.left - visibleLeft;
      } else if (highlightRect.right > visibleRight) {
        nextScrollLeft += highlightRect.right - visibleRight;
      }

      container.scrollLeft = Math.max(0, nextScrollLeft);
      return true;
    }, []);

    const schedulePreciseReveal = useCallback(() => {
      cancelPreciseReveal();
      revealFrameRef.current = window.requestAnimationFrame(() => {
        revealFrameRef.current = null;
        revealHighlightedMarkPrecisely();
        revealFollowupFrameRef.current = window.requestAnimationFrame(() => {
          revealFollowupFrameRef.current = null;
          if (revealHighlightedMarkPrecisely()) {
            pendingRevealRef.current = null;
          }
        });
      });
    }, [cancelPreciseReveal, revealHighlightedMarkPrecisely]);

    useImperativeHandle(
      ref,
      () => ({
        focus() {
          containerRef.current?.focus({ preventScroll: true });
        },
        revealRange(startOffset, endOffset) {
          const safeOffset = clamp(startOffset, 0, text.length);
          const safeEndOffset = clamp(endOffset, safeOffset, text.length);
          const rowIndex = findRawSegmentIndex(segments, safeOffset);
          const rowStart = segments.starts[rowIndex] ?? 0;
          const rowEnd = segments.ends[rowIndex] ?? rowStart;
          const localStart = clamp(safeOffset - rowStart, 0, Math.max(0, rowEnd - rowStart));
          const nextScrollTop = Math.max(0, (rowIndex - 3) * LINE_HEIGHT);
          const nextScrollLeft = Math.max(0, (localStart - REVEAL_CONTEXT_CHARS) * APPROX_CHAR_WIDTH);
          pendingRevealRef.current = { start: safeOffset, end: safeEndOffset };
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
          schedulePreciseReveal();
        },
      }),
      [schedulePreciseReveal, segments, text.length]
    );

    useEffect(
      () => () => {
        cancelPreciseReveal();
      },
      [cancelPreciseReveal]
    );

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
      const end = Math.min(rowCount - 1, Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + OVERSCAN);

      return { start, end };
    }, [rowCount, scrollTop, viewportHeight]);

    useEffect(() => {
      const pendingReveal = pendingRevealRef.current;
      if (
        !highlightRange ||
        !pendingReveal ||
        pendingReveal.start !== highlightRange.start ||
        pendingReveal.end !== highlightRange.end
      ) {
        return;
      }

      schedulePreciseReveal();
    }, [highlightRange, schedulePreciseReveal, visibleRange.end, visibleRange.start]);

    const rows = [];
    for (let rowIndex = visibleRange.start; rowIndex <= visibleRange.end; rowIndex += 1) {
      const chunkStart = segments.starts[rowIndex] ?? 0;
      const chunkEnd = segments.ends[rowIndex] ?? chunkStart;
      const isHighlighted = Boolean(
        highlightRange && highlightRange.end > chunkStart && highlightRange.start < chunkEnd
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
          <span className="large-raw-offset">{chunkStart.toLocaleString()}</span>
          <code className="large-raw-text">{renderChunkText(text, chunkStart, chunkEnd, highlightRange)}</code>
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
        <div className="large-raw-spacer" style={{ height: `${rowCount * LINE_HEIGHT}px` }}>
          {rows}
        </div>
      </div>
    );
  }
);

LargeRawReadonlyViewer.displayName = 'LargeRawReadonlyViewer';

export default LargeRawReadonlyViewer;
