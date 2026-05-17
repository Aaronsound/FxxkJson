import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import type { JsonEditPath } from '../types/jsonTool';
import type { LocateRange } from './lightweightLocate';

export function getJsonPathLocateRange(text: string, path: JsonEditPath): LocateRange | null {
  if (!text.trim()) {
    return null;
  }

  const tree = parseTree(text);
  if (!tree) {
    return null;
  }

  const node = findNodeAtLocation(tree, path);
  if (!node) {
    return null;
  }

  return {
    startOffset: node.offset,
    endOffset: node.offset + node.length,
  };
}
