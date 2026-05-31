import type { Node } from 'jsonc-parser';

export function getDirectLocateRange(
  cached: unknown,
  offset: number
): { endOffset: number; startOffset: number } | null;
export function getDirectRightLocateRange(cached: unknown, offset: number): { endOffset: number; startOffset: number };
export function getPathCalibratedDirectLocateRange(
  tabId: string,
  cached: unknown,
  offset: number,
  getDirectValueTree: (tabId: string, requestId: number, text: string) => Node | undefined
): {
  leftRange: { endOffset: number; startOffset: number };
  path: Array<string | number>;
  rightRange: { endOffset: number; startOffset: number };
} | null;
export function getRightOnlyLocateResult(
  tabId: string,
  requestId: number,
  offset: number,
  cachedViewer: unknown,
  getDirectValueTree: (tabId: string, requestId: number, text: string) => Node | undefined
): Record<string, unknown>;
