import { getLocation } from 'jsonc-parser';
import type { JsonEditPath, LargeJsonLineIndex, WorkerMessage } from '../types/jsonTool';
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
  viewerData?: LargeJsonLineIndex;
}

interface RightLocateViewerEntry {
  formattedText?: string;
  requestId?: number;
  viewerData?: LargeJsonLineIndex;
}

interface PathCalibratedDirectLocateRange {
  leftRange: LocateRange;
  path: JsonEditPath;
  rightRange: LocateRange;
}

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
  cached: DirectLocateCacheEntry | null | undefined,
  offset: number
): PathCalibratedDirectLocateRange | null {
  if (
    !cached ||
    !cached.directLocate ||
    typeof cached.rawText !== 'string' ||
    typeof cached.formattedText !== 'string'
  ) {
    return null;
  }

  const candidateOffsets = getLocateCandidateOffsets(cached.formattedText, offset);
  for (const candidateOffset of candidateOffsets) {
    const location = getLocation(cached.formattedText, candidateOffset);
    const rightRange = getJsonPathLocateRange(cached.formattedText, location.path);
    const leftRange = getJsonPathLocateRange(cached.rawText, location.path);
    if (leftRange && rightRange) {
      return {
        leftRange,
        rightRange,
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
  cachedViewer: RightLocateViewerEntry | null | undefined
): WorkerMessage {
  const sourceText = cachedViewer?.formattedText;

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
    const candidateOffsets = getLocateCandidateOffsets(sourceText, offset);
    for (const candidateOffset of candidateOffsets) {
      const location = getLocation(sourceText, candidateOffset);
      const rightRange = getJsonPathLocateRange(sourceText, location.path);

      if (rightRange) {
        return {
          type: 'locate-result',
          requestId,
          tabId,
          found: true,
          rightOnly: true,
          rightStartOffset: rightRange.startOffset,
          rightEndOffset: rightRange.endOffset,
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
