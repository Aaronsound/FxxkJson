import { findNodeAtLocation, getLocation } from 'jsonc-parser';
import type { Node } from 'jsonc-parser';
import type { JsonEditPath, LargeJsonViewerData, WorkerMessage } from '../types/jsonTool';
import type { LightweightLocateCache, LocateRange } from '../utils/lightweightLocate';
import { getIdentityLocateRange, getLightweightTokenLocateRange } from '../utils/lightweightLocate';
import { getJsonPathLocateRange } from '../utils/jsonPathLocate';
import { getLocateCandidateOffsets } from './jsonWorkerLocateCandidates';

interface DirectLocateCacheEntry {
  directLocate?: boolean;
  directLocateMode?: 'identity' | 'token-search';
  formattedText?: string;
  rawText?: string;
  requestId?: number;
  tokenLocateCache?: LightweightLocateCache;
  viewerData?: LargeJsonViewerData;
}

interface RightLocateViewerEntry {
  formattedText?: string;
  requestId?: number;
  viewerData?: LargeJsonViewerData;
}

interface PathCalibratedDirectLocateRange {
  leftRange: LocateRange;
  path: JsonEditPath;
  rightRange: LocateRange;
}

type GetDirectValueTree = (tabId: string, requestId: number, text: string) => Node | undefined;

export function getDirectLocateRange(cached: DirectLocateCacheEntry | null | undefined, offset: number) {
  if (!cached || !cached.directLocate || !cached.viewerData || !(cached.viewerData.lineStarts instanceof Uint32Array)) {
    return null;
  }

  if (
    cached.directLocateMode === 'token-search' &&
    typeof cached.rawText === 'string' &&
    typeof cached.formattedText === 'string'
  ) {
    return getLightweightTokenLocateRange(
      cached.rawText,
      cached.formattedText,
      cached.viewerData,
      offset,
      cached.tokenLocateCache
    );
  }

  return getIdentityLocateRange(
    typeof cached.formattedText === 'string' ? cached.formattedText.length : offset + 1,
    cached.viewerData,
    offset
  );
}

export function getDirectRightLocateRange(cached: DirectLocateCacheEntry | null | undefined, offset: number) {
  if (
    !cached ||
    typeof cached.formattedText !== 'string' ||
    !cached.viewerData ||
    !(cached.viewerData.lineStarts instanceof Uint32Array)
  ) {
    const safeOffset = Math.max(0, Math.floor(offset));
    return {
      startOffset: safeOffset,
      endOffset: safeOffset + 1,
    };
  }

  return getIdentityLocateRange(cached.formattedText.length, cached.viewerData, offset);
}

export function getPathCalibratedDirectLocateRange(
  tabId: string,
  cached: DirectLocateCacheEntry | null | undefined,
  offset: number,
  getDirectValueTree: GetDirectValueTree
): PathCalibratedDirectLocateRange | null {
  if (
    !cached ||
    !cached.directLocate ||
    typeof cached.rawText !== 'string' ||
    typeof cached.formattedText !== 'string'
  ) {
    return null;
  }

  if (typeof cached.requestId !== 'number') {
    return null;
  }

  const formattedTree = getDirectValueTree(tabId, cached.requestId, cached.formattedText);
  if (!formattedTree) {
    return null;
  }

  const candidateOffsets = getLocateCandidateOffsets(cached.formattedText, offset);
  for (const candidateOffset of candidateOffsets) {
    const location = getLocation(cached.formattedText, candidateOffset);
    const rightNode = findNodeAtLocation(formattedTree, location.path);

    if (!rightNode) {
      continue;
    }

    const leftRange = getJsonPathLocateRange(cached.rawText, location.path);
    if (leftRange) {
      return {
        leftRange,
        rightRange: {
          startOffset: rightNode.offset,
          endOffset: rightNode.offset + rightNode.length,
        },
        path: location.path,
      };
    }
  }

  return null;
}

export function getRightOnlyLocateResult(
  tabId: string,
  requestId: number,
  offset: number,
  cachedViewer: RightLocateViewerEntry | null | undefined,
  getDirectValueTree: GetDirectValueTree
): WorkerMessage {
  const sourceText = cachedViewer?.formattedText;
  const sourceRequestId = cachedViewer?.requestId ?? requestId;

  if (typeof sourceText !== 'string' || !sourceText) {
    return {
      type: 'locate-result',
      requestId,
      tabId,
      found: false,
      rightOnly: true,
    };
  }

  try {
    const formattedTree = getDirectValueTree(tabId, sourceRequestId, sourceText);

    if (!formattedTree) {
      return {
        type: 'locate-result',
        requestId,
        tabId,
        found: false,
        rightOnly: true,
      };
    }

    const candidateOffsets = getLocateCandidateOffsets(sourceText, offset);
    for (const candidateOffset of candidateOffsets) {
      const location = getLocation(sourceText, candidateOffset);
      const rightNode = findNodeAtLocation(formattedTree, location.path);

      if (rightNode) {
        return {
          type: 'locate-result',
          requestId,
          tabId,
          found: true,
          rightOnly: true,
          rightStartOffset: rightNode.offset,
          rightEndOffset: rightNode.offset + rightNode.length,
          path: location.path,
        };
      }
    }

    return {
      type: 'locate-result',
      requestId,
      tabId,
      found: false,
      rightOnly: true,
    };
  } catch {
    return {
      type: 'locate-result',
      requestId,
      tabId,
      found: false,
      rightOnly: true,
    };
  }
}

export type { DirectLocateCacheEntry, PathCalibratedDirectLocateRange, RightLocateViewerEntry };
