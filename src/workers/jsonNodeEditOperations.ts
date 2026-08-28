import { findNodeAtLocation } from 'jsonc-parser';
import type { Node } from 'jsonc-parser';
import { DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD, LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type {
  JsonDocumentMetrics,
  JsonEditPath,
  JsonTextPatch,
  LargeJsonLineIndex,
  LargeJsonViewerData,
  LargeRawViewerData,
} from '../types/jsonTool';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';
import { buildLargeRawViewerData } from '../utils/largeRawViewerData';
import { measureJsonDocument } from '../utils/jsonDocumentMetrics';
import { createJsonTextPatch, patchLargeJsonLineIndex } from '../utils/jsonTextPatch';
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
  formattedPatch: JsonTextPatch | null;
  formattedText: string | null;
  formattedMetrics: JsonDocumentMetrics | null;
  rawPatch: JsonTextPatch;
  rawText: string;
  rawMetrics: JsonDocumentMetrics;
  rawViewerData: LargeRawViewerData | null;
  structureWarming: boolean;
  viewerData: LargeJsonViewerData | null;
  viewerIndexMs: number | null;
  viewerPatchApplied: boolean;
}

interface PatchCachedFormattedNodeResult {
  formattedPatch: JsonTextPatch | null;
  formattedText: string | null;
  formattedMetrics: JsonDocumentMetrics | null;
  structureWarming: boolean;
  viewerData: LargeJsonViewerData | null;
  viewerIndexMs: number | null;
  viewerPatchApplied: boolean;
}

interface JsonNodeEditOperationsArgs {
  clearDeferredStructureWarmup: (tabId: string) => void;
  getLocateCandidateOffsets: (text: string, offset: number) => number[];
  getStructureWarmupDelayForByteLength: (textByteLength: number, baseDelayMs: number) => number;
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
  getStructureWarmupDelayForByteLength,
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

  function rebuildCachedFormattedArtifacts(
    tabId: string,
    formattedText: string,
    nextFormattedText: string,
    rawText: string,
    rawMetrics: JsonDocumentMetrics,
    allowIncrementalViewerPatch: boolean
  ): PatchCachedFormattedNodeResult {
    const formattedMetrics = measureJsonDocument(nextFormattedText);
    const formattedPatch = createJsonTextPatch(formattedText, nextFormattedText);
    const previousViewerData = viewerCache.get(tabId)?.viewerData ?? structureCache.get(tabId)?.viewerData;
    const viewerIndexStartedAt = performance.now();
    const viewerPatchApplied = Boolean(
      allowIncrementalViewerPatch &&
        previousViewerData &&
        !formattedPatch.text.includes('\n') &&
        !formattedPatch.text.includes('\r') &&
        !formattedText.slice(formattedPatch.startOffset, formattedPatch.endOffset).includes('\n') &&
        !formattedText.slice(formattedPatch.startOffset, formattedPatch.endOffset).includes('\r')
    );
    const workerViewerData = viewerPatchApplied ? patchLargeJsonLineIndex(previousViewerData!, formattedPatch) : null;
    const lineCapacityHint = previousViewerData
      ? Math.min(previousViewerData.lineCount, nextFormattedText.length + 1)
      : undefined;
    const viewerData = viewerPatchApplied
      ? null
      : buildLargeViewerData(nextFormattedText, DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD, lineCapacityHint);
    const viewerIndexMs = performance.now() - viewerIndexStartedAt;
    const nextWorkerViewerData = workerViewerData ?? (viewerData ? copyLargeViewerLineIndex(viewerData) : null);
    const requestId = latestFormatRequestByTab.get(tabId) ?? 0;
    let structureWarming = false;

    if (nextWorkerViewerData) {
      viewerCache.set(tabId, {
        requestId,
        formattedText: nextFormattedText,
        viewerData: nextWorkerViewerData,
      });
    } else {
      viewerCache.delete(tabId);
    }

    clearDeferredStructureWarmup(tabId);

    const cachedStructure = structureCache.get(tabId);
    if (cachedStructure) {
      if (cachedStructure.directLocate) {
        if (nextWorkerViewerData) {
          const isIdentityFormat = rawText === nextFormattedText;
          structureCache.set(tabId, {
            requestId,
            directLocate: true,
            directLocateMode: isIdentityFormat ? 'identity' : 'token-search',
            rawText: isIdentityFormat ? undefined : rawText,
            formattedText: nextFormattedText,
            viewerData: nextWorkerViewerData,
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
          getStructureWarmupDelayForByteLength(
            Math.max(rawMetrics.textByteLength, formattedMetrics.textByteLength),
            150
          )
        );
        structureWarming = true;
      }
    }

    return {
      formattedPatch,
      formattedText: nextFormattedText,
      formattedMetrics,
      structureWarming,
      viewerData,
      viewerIndexMs,
      viewerPatchApplied,
    };
  }

  function getMissingFormattedPatch(): PatchCachedFormattedNodeResult {
    return {
      formattedPatch: null,
      formattedText: null,
      formattedMetrics: null,
      structureWarming: false,
      viewerData: null,
      viewerIndexMs: null,
      viewerPatchApplied: false,
    };
  }

  function finishNodeMutation(
    tabId: string,
    originalRawText: string,
    rawText: string,
    formattedText: string | null,
    nextFormattedText: string | null,
    allowIncrementalViewerPatch: boolean
  ): SaveNodeEditResult {
    const rawMetrics = measureJsonDocument(rawText);
    const rawViewerData = rawMetrics.textByteLength >= LARGE_FILE_THRESHOLD ? buildLargeRawViewerData(rawText) : null;
    const formattedPatch =
      typeof formattedText === 'string' && typeof nextFormattedText === 'string'
        ? rebuildCachedFormattedArtifacts(
            tabId,
            formattedText,
            nextFormattedText,
            rawText,
            rawMetrics,
            allowIncrementalViewerPatch
          )
        : getMissingFormattedPatch();

    nodeEditCache.delete(tabId);

    return {
      rawPatch: createJsonTextPatch(originalRawText, rawText),
      rawText,
      rawMetrics,
      rawViewerData,
      ...formattedPatch,
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
    const formattedText =
      getCachedFormattedText(tabId, structureCache, viewerCache) ?? nodeEditCache.get(tabId)?.formattedText;
    const nextFormattedText =
      typeof formattedText === 'string'
        ? saveJsonNodePreservingOriginalFormat(formattedText, path, text, {
            range: getCachedNodeRange(nodeEditCache, tabId, path, 'formatted', formattedText),
          })
        : null;
    const editedValue = JSON.parse(text) as unknown;
    const allowIncrementalViewerPatch = editedValue === null || typeof editedValue !== 'object';

    return finishNodeMutation(
      tabId,
      originalText,
      rawText,
      formattedText ?? null,
      nextFormattedText,
      allowIncrementalViewerPatch
    );
  }

  function deleteJsonNodeForEdit(tabId: string, originalText: string | undefined, path: JsonEditPath | undefined) {
    if (typeof originalText !== 'string' || !Array.isArray(path)) {
      throw new Error('当前节点无法删除');
    }

    const formattedText =
      getCachedFormattedText(tabId, structureCache, viewerCache) ?? nodeEditCache.get(tabId)?.formattedText;
    const rawText = deleteJsonNodePreservingOriginalFormat(originalText, path);
    const nextFormattedText =
      typeof formattedText === 'string'
        ? formattedText === originalText
          ? rawText
          : deleteJsonNodePreservingOriginalFormat(formattedText, path)
        : null;

    return finishNodeMutation(tabId, originalText, rawText, formattedText ?? null, nextFormattedText, false);
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

    const formattedText =
      getCachedFormattedText(tabId, structureCache, viewerCache) ?? nodeEditCache.get(tabId)?.formattedText;
    const rawText = renameJsonObjectKeyPreservingOriginalFormat(originalText, path, text);
    const nextFormattedText =
      typeof formattedText === 'string'
        ? formattedText === originalText
          ? rawText
          : renameJsonObjectKeyPreservingOriginalFormat(formattedText, path, text)
        : null;

    return finishNodeMutation(tabId, originalText, rawText, formattedText ?? null, nextFormattedText, true);
  }

  return {
    deleteJsonNodeForEdit,
    readJsonNodeForEdit,
    renameJsonNodeKeyForEdit,
    saveJsonNodeForEdit,
  };
}

export type { JsonNodeEditOperationsArgs, NodeEditStructureCacheEntry, NodeEditViewerCacheEntry, SaveNodeEditResult };
