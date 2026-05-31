import { useCallback, useEffect } from 'react';

interface UseContextualFindShortcutArgs {
  openLeftFind: () => void;
  openRightFind: () => void;
}

function isInside(element: Element | null, selector: string) {
  return element instanceof HTMLElement && Boolean(element.closest(selector));
}

export function useContextualFindShortcut({ openLeftFind, openRightFind }: UseContextualFindShortcutArgs) {
  const openContextualFind = useCallback(() => {
    const activeElement = document.activeElement;

    if (isInside(activeElement, '.modal-overlay')) {
      return;
    }

    if (isInside(activeElement, '.left-editor-pane')) {
      openLeftFind();
      return;
    }

    openRightFind();
  }, [openLeftFind, openRightFind]);

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      const isPrimaryFindShortcut = (event.ctrlKey || event.metaKey) && !event.altKey;
      const isAltFindShortcut = event.altKey && !event.ctrlKey && !event.metaKey;
      const isFindShortcut =
        event.key.toLowerCase() === 'f' && !event.shiftKey && (isPrimaryFindShortcut || isAltFindShortcut);

      if (!isFindShortcut || isInside(event.target instanceof Element ? event.target : null, '.modal-overlay')) {
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
  }, [openContextualFind]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFindShortcut?.(openContextualFind);

    return () => {
      unsubscribe?.();
    };
  }, [openContextualFind]);
}
