import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

export type FloatingPanelPosition = {
  x: number;
  y: number;
};

export function useFloatingPanelPosition(expanded: boolean) {
  const [position, setPosition] = useState<FloatingPanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const clampPosition = (nextX: number, nextY: number) => {
    if (typeof window === 'undefined') {
      return { x: nextX, y: nextY };
    }

    const width = panelRef.current?.offsetWidth ?? 360;
    const height = panelRef.current?.offsetHeight ?? 140;
    const margin = 12;
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);

    return {
      x: Math.min(Math.max(margin, nextX), maxX),
      y: Math.min(Math.max(margin, nextY), maxY),
    };
  };

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragOffset = dragOffsetRef.current;
      if (!dragOffset) {
        return;
      }

      const next = clampPosition(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
      setPosition(next);
    };

    const stopDragging = () => {
      dragOffsetRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [isDragging]);

  useEffect(() => {
    const resetToAnchor = () => {
      dragOffsetRef.current = null;
      setIsDragging(false);
      setPosition(null);
    };

    window.addEventListener('resize', resetToAnchor);
    document.addEventListener('fullscreenchange', resetToAnchor);

    return () => {
      window.removeEventListener('resize', resetToAnchor);
      document.removeEventListener('fullscreenchange', resetToAnchor);
    };
  }, []);

  useEffect(() => {
    if (!position) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setPosition((current) => (current ? clampPosition(current.x, current.y) : current));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [expanded]);

  const startDragging = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setPosition((current) => current ?? { x: rect.left, y: rect.top });
    setIsDragging(true);
    event.preventDefault();
  };

  const panelStyle = position
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
        right: 'auto',
        bottom: 'auto',
      }
    : undefined;

  return {
    isDragging,
    panelRef,
    panelStyle,
    startDragging,
  };
}
