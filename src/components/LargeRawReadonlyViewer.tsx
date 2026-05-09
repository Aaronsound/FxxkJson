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
  const chunkCount = Math.max(1, Math.ceil(text.length / CHUNK_SIZE));

  useImperativeHandle(ref, () => ({
    focus() {
      containerRef.current?.focus({ preventScroll: true });
    },
    revealRange(startOffset) {
      const chunkIndex = clamp(Math.floor(startOffset / CHUNK_SIZE), 0, chunkCount - 1);
      const chunkStart = chunkIndex * CHUNK_SIZE;
      const localStart = clamp(startOffset - chunkStart, 0, CHUNK_SIZE);
      const nextScrollTop = Math.max(0, (chunkIndex - 3) * LINE_HEIGHT);
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
  }), [chunkCount]);

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
      chunkCount - 1,
      Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + OVERSCAN
    );

    return { start, end };
  }, [chunkCount, scrollTop, viewportHeight]);

  const rows = [];
  for (let chunkIndex = visibleRange.start; chunkIndex <= visibleRange.end; chunkIndex += 1) {
    const chunkStart = chunkIndex * CHUNK_SIZE;
    const chunkEnd = Math.min(text.length, chunkStart + CHUNK_SIZE);
    const isHighlighted = Boolean(
      highlightRange
      && highlightRange.end > chunkStart
      && highlightRange.start < chunkEnd
    );

    rows.push(
      <div
        key={chunkIndex}
        className={`large-raw-row ${isHighlighted ? 'highlighted' : ''}`}
        style={{
          top: `${chunkIndex * LINE_HEIGHT}px`,
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
        style={{ height: `${chunkCount * LINE_HEIGHT}px` }}
      >
        {rows}
      </div>
    </div>
  );
});

LargeRawReadonlyViewer.displayName = 'LargeRawReadonlyViewer';

export default LargeRawReadonlyViewer;
