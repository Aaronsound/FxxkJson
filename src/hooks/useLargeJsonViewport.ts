import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

interface UseLargeJsonViewportParams {
  containerRef: RefObject<HTMLDivElement | null>;
}

export function useLargeJsonViewport({ containerRef }: UseLargeJsonViewportParams) {
  const pendingScrollTopRef = useRef(0);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

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

  useEffect(
    () => () => {
      if (scrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      }
    },
    []
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
  }, [containerRef]);

  return {
    queueScrollTopUpdate,
    scrollTop,
    viewportHeight,
  };
}
