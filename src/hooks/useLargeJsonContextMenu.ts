import { useCallback, useEffect, useState } from 'react';
import type { LargeJsonContextMenuState } from '../components/LargeJsonContextMenu';

interface UseLargeJsonContextMenuParams {
  searchTerm: string;
}

export function useLargeJsonContextMenu({ searchTerm }: UseLargeJsonContextMenuParams) {
  const [contextMenu, setContextMenu] = useState<LargeJsonContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    setContextMenu(null);
  }, [searchTerm]);

  useEffect(() => {
    const handleGlobalPointer = () => setContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('pointerdown', handleGlobalPointer);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return {
    closeContextMenu,
    contextMenu,
    setContextMenu,
  };
}
