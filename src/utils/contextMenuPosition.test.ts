import { describe, expect, it } from 'vitest';
import { getViewportContextMenuPosition } from './contextMenuPosition';

describe('getViewportContextMenuPosition', () => {
  it('keeps a context menu inside the viewport bottom edge', () => {
    expect(getViewportContextMenuPosition(300, 590, 4, 800, 600)).toEqual({
      x: 300,
      y: 444,
    });
  });

  it('keeps a context menu inside the viewport right edge', () => {
    expect(getViewportContextMenuPosition(790, 120, 3, 800, 600)).toEqual({
      x: 612,
      y: 120,
    });
  });

  it('keeps a context menu away from the top-left viewport edge', () => {
    expect(getViewportContextMenuPosition(-20, -10, 3, 800, 600)).toEqual({
      x: 8,
      y: 8,
    });
  });
});
