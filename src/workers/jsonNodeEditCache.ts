import type { JsonEditPath } from '../types/jsonTool';

interface OffsetNode {
  offset: number;
  length: number;
}

interface CreateNodeEditCacheEntryArgs {
  formattedText: string;
  path: JsonEditPath;
  formattedNode: OffsetNode;
  rawNode?: OffsetNode | null;
  rawTextLength?: number;
}

interface NodeEditCacheEntry {
  formattedText: string;
  path: JsonEditPath;
  formattedStartOffset: number;
  formattedEndOffset: number;
  rawStartOffset?: number;
  rawEndOffset?: number;
  rawTextLength?: number;
}

type NodeRangeKind = 'formatted' | 'raw';

export function areJsonPathsEqual(left: unknown, right: unknown) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

export function createNodeEditCacheEntry({
  formattedText,
  path,
  formattedNode,
  rawNode,
  rawTextLength,
}: CreateNodeEditCacheEntryArgs): NodeEditCacheEntry {
  return {
    formattedText,
    path: [...path],
    formattedStartOffset: formattedNode.offset,
    formattedEndOffset: formattedNode.offset + formattedNode.length,
    rawStartOffset: rawNode?.offset,
    rawEndOffset: rawNode ? rawNode.offset + rawNode.length : undefined,
    rawTextLength,
  };
}

export function getCachedNodeRange(
  cache: Map<string, NodeEditCacheEntry>,
  tabId: string,
  path: JsonEditPath,
  kind: NodeRangeKind,
  sourceText: string
) {
  const cached = cache.get(tabId);
  if (!cached || !areJsonPathsEqual(cached.path, path)) {
    return undefined;
  }

  if (kind === 'formatted' && cached.formattedText !== sourceText) {
    return undefined;
  }

  if (kind === 'raw' && cached.rawTextLength !== sourceText.length) {
    return undefined;
  }

  const startOffset = kind === 'raw' ? cached.rawStartOffset : cached.formattedStartOffset;
  const endOffset = kind === 'raw' ? cached.rawEndOffset : cached.formattedEndOffset;

  if (typeof startOffset !== 'number' || typeof endOffset !== 'number') {
    return undefined;
  }

  return { startOffset, endOffset };
}
