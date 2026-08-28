import { useCallback, useEffect, useRef } from 'react';

interface UseContextualFindShortcutArgs {
  closeLeftFind: () => void;
  closeRightFind: () => void;
  isLeftFindOpen: boolean;
  isRightFindOpen: boolean;
  openLeftFind: () => void;
  openRightFind: () => void;
}

type PaneSide = 'left' | 'right';

function isInside(element: Element | null, selector: string) {
  return element instanceof HTMLElement && Boolean(element.closest(selector));
}

function getPaneSide(element: Element | null): PaneSide | null {
  if (isInside(element, '.left-editor-pane')) return 'left';
  if (isInside(element, '.right-editor-pane')) return 'right';
  return null;
}

export function useContextualFindShortcut({
  closeLeftFind,
  closeRightFind,
  isLeftFindOpen,
  isRightFindOpen,
  openLeftFind,
  openRightFind,
}: UseContextualFindShortcutArgs) {
  const lastActivePaneRef = useRef<PaneSide | null>(null);

  const getActivePane = useCallback((target?: EventTarget | null) => {
    const targetElement = target instanceof Element ? target : null;
    return getPaneSide(targetElement) ?? getPaneSide(document.activeElement) ?? lastActivePaneRef.current;
  }, []);

  const openContextualFind = useCallback(() => {
    const activeElement = document.activeElement;

    if (isInside(activeElement, '.modal-overlay')) {
      return;
    }

    if (getPaneSide(activeElement) === 'left') {
      openLeftFind();
      return;
    }

    openRightFind();
  }, [openLeftFind, openRightFind]);

  useEffect(() => {
    const rememberActivePane = (event: Event) => {
      const pane = getActivePane(event.target);
      if (pane) lastActivePaneRef.current = pane;
    };

    window.addEventListener('focusin', rememberActivePane, true);
    window.addEventListener('pointerdown', rememberActivePane, true);
    return () => {
      window.removeEventListener('focusin', rememberActivePane, true);
      window.removeEventListener('pointerdown', rememberActivePane, true);
    };
  }, [getActivePane]);

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : document.activeElement;

      if (event.key === 'Escape' && !isInside(target, '.modal-overlay') && !isInside(target, '.pane-find-widget')) {
        const activePane = getActivePane(target);
        const shouldCloseLeft =
          activePane === 'left' ? isLeftFindOpen : !activePane && isLeftFindOpen && !isRightFindOpen;
        const shouldCloseRight =
          activePane === 'right' ? isRightFindOpen : !activePane && isRightFindOpen && !isLeftFindOpen;

        if (shouldCloseLeft || shouldCloseRight) {
          event.preventDefault();
          event.stopPropagation();
          if (shouldCloseLeft) closeLeftFind();
          if (shouldCloseRight) closeRightFind();
          return;
        }
      }

      const isPrimaryFindShortcut = (event.ctrlKey || event.metaKey) && !event.altKey;
      const isAltFindShortcut = event.altKey && !event.ctrlKey && !event.metaKey;
      const isFindShortcut =
        event.key.toLowerCase() === 'f' && !event.shiftKey && (isPrimaryFindShortcut || isAltFindShortcut);

      if (!isFindShortcut || isInside(target, '.modal-overlay')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openContextualFind();
    };

    window.addEventListener('keydown', handleFindShortcut, true);
    return () => {
      window.removeEventListener('keydown', handleFindShortcut, true);
    };
  }, [closeLeftFind, closeRightFind, getActivePane, isLeftFindOpen, isRightFindOpen, openContextualFind]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFindShortcut?.(openContextualFind);

    return () => {
      unsubscribe?.();
    };
  }, [openContextualFind]);
}
