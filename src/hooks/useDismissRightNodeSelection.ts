import { useEffect, useRef } from 'react';

const RIGHT_SELECTION_INTERACTION_SELECTOR = '.right-editor-pane .editor-pane-content, .large-json-context-menu';

export function shouldDismissRightNodeSelection(target: EventTarget | null) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(element && !element.closest(RIGHT_SELECTION_INTERACTION_SELECTOR));
}

interface UseDismissRightNodeSelectionArgs {
  activeTabId: string | null;
  hasSelection: boolean;
  onDismiss: (tabId: string) => void;
}

export function useDismissRightNodeSelection({
  activeTabId,
  hasSelection,
  onDismiss,
}: UseDismissRightNodeSelectionArgs) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!activeTabId || !hasSelection) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (shouldDismissRightNodeSelection(event.target)) {
        onDismissRef.current(activeTabId);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [activeTabId, hasSelection]);
}
