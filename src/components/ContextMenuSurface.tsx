import type React from 'react';
import { useEffect, useRef } from 'react';

interface ContextMenuSurfaceProps {
  ariaLabel: string;
  children: React.ReactNode;
  isDarkMode: boolean;
  onClose: () => void;
  style: React.CSSProperties;
}

const getEnabledItems = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));

const focusMenuItem = (items: HTMLButtonElement[], index: number) => {
  items.forEach((item, itemIndex) => {
    item.tabIndex = itemIndex === index ? 0 : -1;
  });
  items[index]?.focus();
};

const ContextMenuSurface: React.FC<ContextMenuSurfaceProps> = ({ ariaLabel, children, isDarkMode, onClose, style }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    focusMenuItem(getEnabledItems(menu), 0);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const menu = menuRef.current;
    if (!menu) {
      return;
    }

    const items = getEnabledItems(menu);
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = 0;

    if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    }

    focusMenuItem(items, nextIndex);
  };

  return (
    <div
      ref={menuRef}
      className={`large-json-context-menu ${isDarkMode ? 'dark' : ''}`}
      style={style}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
};

export default ContextMenuSurface;
