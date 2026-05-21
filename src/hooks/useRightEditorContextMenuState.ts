import { useEffect, useState } from 'react';
import type { RightEditorContextMenuState } from '../components/RightEditorContextMenu';

export function useRightEditorContextMenuState(activeTabId: string, shouldUseDedicatedRightViewer: boolean) {
  const [rightEditorContextMenu, setRightEditorContextMenu] = useState<RightEditorContextMenuState | null>(null);

  useEffect(() => {
    setRightEditorContextMenu(null);
  }, [activeTabId, shouldUseDedicatedRightViewer]);

  useEffect(() => {
    if (!rightEditorContextMenu) {
      return;
    }

    const closeContextMenu = () => setRightEditorContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('pointerdown', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('pointerdown', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [rightEditorContextMenu]);

  return {
    rightEditorContextMenu,
    setRightEditorContextMenu,
  };
}
