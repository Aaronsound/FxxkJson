import { findNodeAtLocation } from 'jsonc-parser';
import type { Node } from 'jsonc-parser';
import { DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD, LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type {
  JsonDocumentMetrics,
  JsonEditPath,
  LargeJsonLineIndex,
  LargeJsonViewerData,
  LargeRawViewerData,
} from '../types/jsonTool';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';
import { buildLargeRawViewerData } from '../utils/largeRawViewerData';
import { measureJsonDocument } from '../utils/jsonDocumentMetrics';
import { getJsonOffsetLocateResult, getJsonPathLocateRange } from '../utils/jsonPathLocate';
import type { LightweightLocateCache } from '../utils/lightweightLocate';
import {
  deleteJsonNodePreservingOriginalFormat,
  renameJsonObjectKeyPreservingOriginalFormat,
  saveJsonNodePreservingOriginalFormat,
} from '../utils/preserveJsonFormat';
import { createNodeEditCacheEntry, getCachedNodeRange } from './jsonNodeEditCache';
import { copyLargeViewerLineIndex } from './jsonWorkerTextPayload';

interface NodeEditStructureCacheEntry {
  directLocate?: boolean;
  directLocateMode?: 'identity' | 'token-search';
  formattedText?: string;
  formattedTree?: Node;
  rawText?: string;
  rawTree?: Node;
  requestId: number;
  tokenLocateCache?: LightweightLocateCache;
  viewerData?: LargeJsonLineIndex | null;
}

interface NodeEditViewerCacheEntry {
  formattedText: string;
  requestId: number;
  viewerData: LargeJsonLineIndex;
}

interface SaveNodeEditResult {
  formattedText: string | null;
  formattedMetrics: JsonDocumentMetrics | null;
  rawText: string;
  rawMetrics: JsonDocumentMetrics;
  rawViewerData: LargeRawViewerData | null;
  structureWarming: boolean;
  viewerData: LargeJsonViewerData | null;
  viewerIndexMs: number | null;
}

interface PatchCachedFormattedNodeResult {
  formattedText: string | null;
  formattedMetrics: JsonDocumentMetrics | null;
  structureWarming: boolean;
  viewerData: LargeJsonViewerData | null;
  viewerIndexMs: number | null;
}

interface JsonNodeEditOperationsArgs {
  clearDeferredStructureWarmup: (tabId: string) => void;
  getLocateCandidateOffsets: (text: string, offset: number) => number[];
  getStructureWarmupDelayForTexts: (
    rawText: string | null | undefined,
    formattedText: string | null | undefined,
    baseDelayMs: number
  ) => number;
  latestFormatRequestByTab: Map<string, number>;
  nodeEditCache: Parameters<typeof getCachedNodeRange>[0];
  scheduleDeferredStructureWarmup: (tabId: string, requestId: number, delayMs?: number) => void;
  structureCache: Map<string, NodeEditStructureCacheEntry>;
  viewerCache: Map<string, NodeEditViewerCacheEntry>;
}

function getCachedFormattedText(
  tabId: string,
  structureCache: Map<string, NodeEditStructureCacheEntry>,
  viewerCache: Map<string, NodeEditViewerCacheEntry>
) {
  const cachedStructure = structureCache.get(tabId);
  if (typeof cachedStructure?.formattedText === 'string') {
    return cachedStructure.formattedText;
  }

  const cachedViewer = viewerCache.get(tabId);
  if (typeof cachedViewer?.formattedText === 'string') {
    return cachedViewer.formattedText;
  }

  return null;
}

export function createJsonNodeEditOperations({
  clearDeferredStructureWarmup,
  getLocateCandidateOffsets,
  getStructureWarmupDelayForTexts,
  latestFormatRequestByTab,
  nodeEditCache,
  scheduleDeferredStructureWarmup,
  structureCache,
  viewerCache,
}: JsonNodeEditOperationsArgs) {
  function readJsonNodeForEdit(tabId: string, text: string | undefined, offset: number | undefined) {
    const sourceText =
      typeof text === 'string' && text.trim() ? text : getCachedFormattedText(tabId, structureCache, viewerCache);
    if (
      typeof sourceText !== 'string' ||
      !sourceText.trim() ||
      typeof offset !== 'number' ||
      !Number.isFinite(offset)
    ) {
      throw new Error('当前节点无法编辑');
    }

    const cachedStructure = structureCache.get(tabId);
    const hasMatchingStructureText = cachedStructure?.formattedText === sourceText;
    const rawSourceText = hasMatchingStructureText
      ? typeof cachedStructure.rawText === 'string'
        ? cachedStructure.rawText
        : cachedStructure.directLocateMode === 'identity'
          ? sourceText
          : null
      : null;

    const candidateOffsets = getLocateCandidateOffsets(sourceText, offset);
    for (const candidateOffset of candidateOffsets) {
      const formattedResult = getJsonOffsetLocateResult(sourceText, candidateOffset);

      if (formattedResult) {
        const rawRange = rawSourceText ? getJsonPathLocateRange(rawSourceText, formattedResult.path) : null;
        const rawTreeNode =
          !rawRange && hasMatchingStructureText && cachedStructure.rawTree
            ? findNodeAtLocation(cachedStructure.rawTree, formattedResult.path)
            : null;
        const rawNode = rawRange
          ? { offset: rawRange.startOffset, length: rawRange.endOffset - rawRange.startOffset }
          : rawTreeNode;
        const rawTextLength =
          typeof rawSourceText === 'string' ? rawSourceText.length : cachedStructure?.rawTree?.length;

        nodeEditCache.set(
          tabId,
          createNodeEditCacheEntry({
            formattedText: sourceText,
            path: formattedResult.path,
            formattedNode: {
              offset: formattedResult.range.startOffset,
              length: formattedResult.range.endOffset - formattedResult.range.startOffset,
            },
            rawNode,
            rawTextLength,
          })
        );

        return JSON.stringify({
          path: formattedResult.path,
          value: sourceText.slice(formattedResult.range.startOffset, formattedResult.range.endOffset),
        });
      }
    }

    throw new Error('当前节点无法编辑');
  }

  function patchCachedFormattedNode(
    tabId: string,
    text: string,
    path: JsonEditPath,
    rawText: string
  ): PatchCachedFormattedNodeResult {
    const formattedText =
      getCachedFormattedText(tabId, structureCache, viewerCache) ?? nodeEditCache.get(tabId)?.formattedText;

    if (typeof formattedText !== 'string') {
      return {
        formattedText: null,
        formattedMetrics: null,
        structureWarming: false,
        viewerData: null,
        viewerIndexMs: null,
      };
    }

    const nextFormattedText = saveJsonNodePreservingOriginalFormat(formattedText, path, text, {
      range: getCachedNodeRange(nodeEditCache, tabId, path, 'formatted', formattedText),
    });
    const formattedMetrics = measureJsonDocument(nextFormattedText);
    const previousViewerData = viewerCache.get(tabId)?.viewerData ?? structureCache.get(tabId)?.viewerData;
    const lineCapacityHint = previousViewerData
      ? Math.min(previousViewerData.lineCount, nextFormattedText.length + 1)
      : undefined;
    const viewerIndexStartedAt = performance.now();
    const viewerData = buildLargeViewerData(nextFormattedText, DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD, lineCapacityHint);
    const viewerIndexMs = performance.now() - viewerIndexStartedAt;
    const workerViewerData = viewerData ? copyLargeViewerLineIndex(viewerData) : null;
    const requestId = latestFormatRequestByTab.get(tabId) ?? 0;
    let structureWarming = false;

    if (viewerData) {
      viewerCache.set(tabId, {
        requestId,
        formattedText: nextFormattedText,
        viewerData: workerViewerData!,
      });
    } else {
      viewerCache.delete(tabId);
    }

    clearDeferredStructureWarmup(tabId);

    const cachedStructure = structureCache.get(tabId);
    if (cachedStructure) {
      if (cachedStructure.directLocate) {
        if (viewerData) {
          structureCache.set(tabId, {
            requestId,
            directLocate: true,
            directLocateMode: rawText === nextFormattedText ? 'identity' : 'token-search',
            rawText: rawText === nextFormattedText ? undefined : rawText,
            formattedText: nextFormattedText,
            viewerData: workerViewerData!,
            tokenLocateCache: { tokenOffsetsByToken: new Map() },
          });
        } else {
          structureCache.delete(tabId);
        }
      } else {
        structureCache.set(tabId, {
          requestId,
          rawText,
          formattedText: nextFormattedText,
          rawTree: undefined,
          formattedTree: undefined,
        });
        scheduleDeferredStructureWarmup(
          tabId,
          requestId,
          getStructureWarmupDelayForTexts(rawText, nextFormattedText, 150)
        );
        structureWarming = true;
      }
    }

    return {
      formattedText: nextFormattedText,
      formattedMetrics,
      structureWarming,
      viewerData,
      viewerIndexMs,
    };
  }

  function saveJsonNodeForEdit(
    tabId: string,
    text: string,
    originalText: string | undefined,
    path: JsonEditPath | undefined
  ): SaveNodeEditResult {
    if (typeof originalText !== 'string' || !Array.isArray(path)) {
      throw new Error('当前节点无法保存');
    }

    const rawText = saveJsonNodePreservingOriginalFormat(originalText, path, text, {
      range: getCachedNodeRange(nodeEditCache, tabId, path, 'raw', originalText),
    });
    const rawMetrics = measureJsonDocument(rawText);
    const rawViewerData = rawMetrics.textByteLength >= LARGE_FILE_THRESHOLD ? buildLargeRawViewerData(rawText) : null;
    const formattedPatch = patchCachedFormattedNode(tabId, text, path, rawText);

    nodeEditCache.delete(tabId);

    return {
      rawText,
      rawMetrics,
      rawViewerData,
      ...formattedPatch,
    };
  }

  function deleteJsonNodeForEdit(tabId: string, originalText: string | undefined, path: JsonEditPath | undefined) {
    if (typeof originalText !== 'string' || !Array.isArray(path)) {
      throw new Error('当前节点无法删除');
    }

    nodeEditCache.delete(tabId);
    return deleteJsonNodePreservingOriginalFormat(originalText, path);
  }

  function renameJsonNodeKeyForEdit(
    tabId: string,
    text: string,
    originalText: string | undefined,
    path: JsonEditPath | undefined
  ) {
    if (typeof originalText !== 'string' || !Array.isArray(path)) {
      throw new Error('当前 key 无法重命名');
    }

    nodeEditCache.delete(tabId);
    return renameJsonObjectKeyPreservingOriginalFormat(originalText, path, text);
  }

  return {
    deleteJsonNodeForEdit,
    readJsonNodeForEdit,
    renameJsonNodeKeyForEdit,
    saveJsonNodeForEdit,
  };
}

export type { JsonNodeEditOperationsArgs, NodeEditStructureCacheEntry, NodeEditViewerCacheEntry, SaveNodeEditResult };
