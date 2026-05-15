const VIEWPORT_PADDING = 8;
const ESTIMATED_ITEM_HEIGHT = 34;
const MENU_VERTICAL_PADDING = 12;
const DEFAULT_MENU_WIDTH = 180;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function getViewportContextMenuPosition(
  x: number,
  y: number,
  itemCount: number,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight
) {
  const estimatedHeight = Math.max(1, itemCount) * ESTIMATED_ITEM_HEIGHT + MENU_VERTICAL_PADDING;
  const maxX = Math.max(VIEWPORT_PADDING, viewportWidth - DEFAULT_MENU_WIDTH - VIEWPORT_PADDING);
  const maxY = Math.max(VIEWPORT_PADDING, viewportHeight - estimatedHeight - VIEWPORT_PADDING);

  return {
    x: clamp(x, VIEWPORT_PADDING, maxX),
    y: clamp(y, VIEWPORT_PADDING, maxY),
  };
}
