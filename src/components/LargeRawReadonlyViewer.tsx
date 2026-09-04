import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { LargeRawViewerData } from '../types/jsonTool';
import { JSON_EDITOR_LINE_HEIGHT } from '../utils/jsonEditorTypography';
import { tokenizeJsonLine } from '../utils/largeJsonViewerRender';
import {
  buildLargeRawViewerLayoutData,
  findRawSegmentIndex,
  getRawSegmentEnd,
  RAW_SYNTAX_ESCAPED,
  RAW_SYNTAX_IN_STRING,
  RAW_SYNTAX_KEY_STRING,
  RAW_SYNTAX_LITERAL_STRING,
} from '../utils/largeRawViewerData';
import './LargeRawReadonlyViewer.css';

const LINE_HEIGHT = JSON_EDITOR_LINE_HEIGHT;
const OVERSCAN = 20;
const APPROX_CHAR_WIDTH = 7.7;
const REVEAL_CONTEXT_CHARS = 24;
const STICKY_OFFSET_WIDTH = 88;
const PRECISE_REVEAL_PADDING = 24;

export interface RawHighlightRange {
  start: number;
  end: number;
}

export interface LargeRawReadonlyRowProps {
  chunkEnd: number;
  chunkStart: number;
  highlightRange: RawHighlightRange | null;
  lineNumber: number;
  rowIndex: number;
  syntaxState: number;
  text: string;
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
  highlightRange: RawHighlightRange | null,
  syntaxState: number
) {
  const chunkText = text.slice(chunkStart, chunkEnd);
  const continuation =
    syntaxState & RAW_SYNTAX_IN_STRING
      ? {
          className:
            syntaxState & RAW_SYNTAX_KEY_STRING
              ? 'large-json-token large-json-token-key'
              : 'large-json-token large-json-token-value large-json-token-string',
          escaped: Boolean(syntaxState & RAW_SYNTAX_ESCAPED),
        }
      : undefined;
  const tokens =
    syntaxState & RAW_SYNTAX_LITERAL_STRING
      ? [
          {
            start: 0,
            end: chunkText.length,
            className: 'large-json-token large-json-token-value large-json-token-string',
          },
        ]
      : tokenizeJsonLine(chunkText, continuation);
  const localHighlightStart = highlightRange ? clamp(highlightRange.start - chunkStart, 0, chunkText.length) : -1;
  const localHighlightEnd = highlightRange
    ? clamp(highlightRange.end - chunkStart, localHighlightStart, chunkText.length)
    : -1;

  return tokens.map((token, tokenIndex) => {
    const highlightStart = Math.max(token.start, localHighlightStart);
    const highlightEnd = Math.min(token.end, localHighlightEnd);
    const hasHighlight = highlightEnd > highlightStart;
    const content = hasHighlight ? (
      <>
        {chunkText.slice(token.start, highlightStart)}
        <mark className="large-raw-highlight" data-large-raw-highlight="true">
          {chunkText.slice(highlightStart, highlightEnd)}
        </mark>
        {chunkText.slice(highlightEnd, token.end)}
      </>
    ) : (
      chunkText.slice(token.start, token.end)
    );

    return token.className ? (
      <span className={token.className} key={token.start || tokenIndex}>
        {content}
      </span>
    ) : (
      <span key={token.start || tokenIndex}>{content}</span>
    );
  });
}

function chunkIntersectsHighlight(chunkStart: number, chunkEnd: number, highlightRange: RawHighlightRange | null) {
  return Boolean(highlightRange && highlightRange.end > chunkStart && highlightRange.start < chunkEnd);
}

export function areLargeRawReadonlyRowPropsEqual(previous: LargeRawReadonlyRowProps, next: LargeRawReadonlyRowProps) {
  if (
    previous.text !== next.text ||
    previous.rowIndex !== next.rowIndex ||
    previous.chunkStart !== next.chunkStart ||
    previous.chunkEnd !== next.chunkEnd ||
    previous.lineNumber !== next.lineNumber ||
    previous.syntaxState !== next.syntaxState
  ) {
    return false;
  }

  const previousHighlighted = chunkIntersectsHighlight(previous.chunkStart, previous.chunkEnd, previous.highlightRange);
  const nextHighlighted = chunkIntersectsHighlight(next.chunkStart, next.chunkEnd, next.highlightRange);
  if (!previousHighlighted || !nextHighlighted) {
    return previousHighlighted === nextHighlighted;
  }

  const chunkLength = previous.chunkEnd - previous.chunkStart;
  const previousStart = clamp((previous.highlightRange?.start ?? 0) - previous.chunkStart, 0, chunkLength);
  const nextStart = clamp((next.highlightRange?.start ?? 0) - next.chunkStart, 0, chunkLength);
  return (
    previousStart === nextStart &&
    clamp((previous.highlightRange?.end ?? 0) - previous.chunkStart, previousStart, chunkLength) ===
      clamp((next.highlightRange?.end ?? 0) - next.chunkStart, nextStart, chunkLength)
  );
}

function LargeRawReadonlyRowView({
  chunkEnd,
  chunkStart,
  highlightRange,
  lineNumber,
  rowIndex,
  syntaxState,
  text,
}: LargeRawReadonlyRowProps) {
  const isHighlighted = chunkIntersectsHighlight(chunkStart, chunkEnd, highlightRange);

  return (
    <div
      className={`large-raw-row ${isHighlighted ? 'highlighted' : ''}`}
      style={{
        top: `${rowIndex * LINE_HEIGHT}px`,
        height: `${LINE_HEIGHT}px`,
      }}
    >
      <span className="large-raw-offset" title={`offset ${chunkStart.toLocaleString()}`}>
        {lineNumber > 0 ? lineNumber.toLocaleString() : ''}
      </span>
      <code className="large-raw-text">{renderChunkText(text, chunkStart, chunkEnd, highlightRange, syntaxState)}</code>
    </div>
  );
}

const LargeRawReadonlyRow = memo(LargeRawReadonlyRowView, areLargeRawReadonlyRowPropsEqual);
LargeRawReadonlyRow.displayName = 'LargeRawReadonlyRow';

const LargeRawReadonlyViewer = forwardRef<LargeRawReadonlyViewerHandle, LargeRawReadonlyViewerProps>(
  ({ text, data, isDarkMode, highlightRange }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pendingRevealRef = useRef<RawHighlightRange | null>(null);
    const revealFrameRef = useRef<number | null>(null);
    const revealFollowupFrameRef = useRef<number | null>(null);
    const scrollAnimationFrameRef = useRef<number | null>(null);
    const pendingScrollTopRef = useRef(0);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const segments = useMemo(() => data ?? buildLargeRawViewerLayoutData(text), [data, text]);
    const rowCount = segments.rowCount;

    const queueScrollTopUpdate = useCallback((nextScrollTop: number) => {
      pendingScrollTopRef.current = nextScrollTop;
      if (scrollAnimationFrameRef.current !== null) {
        return;
      }

      scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
        scrollAnimationFrameRef.current = null;
        setScrollTop(pendingScrollTopRef.current);
      });
    }, []);

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
          const rowEnd = getRawSegmentEnd(segments, rowIndex);
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
        if (scrollAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(scrollAnimationFrameRef.current);
        }
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
      void visibleRange.end;
      void visibleRange.start;
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
      const chunkEnd = getRawSegmentEnd(segments, rowIndex);

      rows.push(
        <LargeRawReadonlyRow
          key={rowIndex}
          chunkEnd={chunkEnd}
          chunkStart={chunkStart}
          highlightRange={highlightRange}
          lineNumber={segments.lineNumbers[rowIndex] ?? 0}
          rowIndex={rowIndex}
          syntaxState={segments.syntaxStates[rowIndex] ?? 0}
          text={text}
        />
      );
    }

    return (
      <div
        ref={containerRef}
        className={`large-raw-viewer ${isDarkMode ? 'dark' : ''}`}
        tabIndex={0}
        onScroll={(event) => queueScrollTopUpdate(event.currentTarget.scrollTop)}
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
