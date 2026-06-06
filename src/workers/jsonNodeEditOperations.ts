import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';
import type { Node } from 'jsonc-parser';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type { JsonEditPath, LargeJsonViewerData, LargeRawViewerData } from '../types/jsonTool';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';
import { buildLargeRawViewerData } from '../utils/largeRawViewerData';
import type { LightweightLocateCache } from '../utils/lightweightLocate';
import {
  deleteJsonNodePreservingOriginalFormat,
  renameJsonObjectKeyPreservingOriginalFormat,
  saveJsonNodePreservingOriginalFormat,
} from '../utils/preserveJsonFormat';
import { createNodeEditCacheEntry, getCachedNodeRange } from './jsonNodeEditCache';
import type { DirectValueTreeCacheEntry } from './jsonWorkerStructureOperations';

interface NodeEditStructureCacheEntry {
  directLocate?: boolean;
  directLocateMode?: 'identity' | 'token-search';
  formattedText?: string;
  formattedTree?: Node;
  rawText?: string;
  rawTree?: Node;
  requestId: number;
  tokenLocateCache?: LightweightLocateCache;
  viewerData?: LargeJsonViewerData | null;
}

interface NodeEditViewerCacheEntry {
  formattedText: string;
  requestId: number;
  viewerData: LargeJsonViewerData;
}

interface SaveNodeEditResult {
  formattedText: string | null;
  rawText: string;
  rawViewerData: LargeRawViewerData | null;
  structureWarming: boolean;
  viewerData: LargeJsonViewerData | null;
  viewerIndexMs: number | null;
}

interface PatchCachedFormattedNodeResult {
  formattedText: string | null;
  structureWarming: boolean;
  viewerData: LargeJsonViewerData | null;
  viewerIndexMs: number | null;
}

interface JsonNodeEditOperationsArgs {
  clearDeferredStructureWarmup: (tabId: string) => void;
  clearDirectValueWarmup: (tabId: string) => void;
  directValueTreeCache: Map<string, DirectValueTreeCacheEntry>;
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
  clearDirectValueWarmup,
  directValueTreeCache,
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
    const tree =
      cachedStructure?.formattedText === sourceText && cachedStructure.formattedTree
        ? cachedStructure.formattedTree
        : parseTree(sourceText);

    if (!tree) {
      throw new Error('当前节点无法编辑');
    }

    const candidateOffsets = getLocateCandidateOffsets(sourceText, offset);
    for (const candidateOffset of candidateOffsets) {
      const location = getLocation(sourceText, candidateOffset);
      const node = findNodeAtLocation(tree, location.path);

      if (node) {
        if (cachedStructure?.formattedText === sourceText && !cachedStructure.formattedTree) {
          cachedStructure.formattedTree = tree;
          structureCache.set(tabId, cachedStructure);
        }

        const rawNode =
          cachedStructure?.formattedText === sourceText && cachedStructure.rawTree
            ? findNodeAtLocation(cachedStructure.rawTree, location.path)
            : null;
        const rawTextLength =
          typeof cachedStructure?.rawText === 'string'
            ? cachedStructure.rawText.length
            : cachedStructure?.rawTree?.length;

        nodeEditCache.set(
          tabId,
          createNodeEditCacheEntry({
            formattedText: sourceText,
            path: [...location.path],
            formattedNode: node,
            rawNode,
            rawTextLength,
          })
        );

        return JSON.stringify({
          path: location.path,
          value: sourceText.slice(node.offset, node.offset + node.length),
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
        structureWarming: false,
        viewerData: null,
        viewerIndexMs: null,
      };
    }

    const nextFormattedText = saveJsonNodePreservingOriginalFormat(formattedText, path, text, {
      range: getCachedNodeRange(nodeEditCache, tabId, path, 'formatted', formattedText),
    });
    const viewerIndexStartedAt = performance.now();
    const viewerData = buildLargeViewerData(nextFormattedText);
    const viewerIndexMs = performance.now() - viewerIndexStartedAt;
    const requestId = latestFormatRequestByTab.get(tabId) ?? 0;
    let structureWarming = false;

    if (viewerData) {
      viewerCache.set(tabId, {
        requestId,
        formattedText: nextFormattedText,
        viewerData,
      });
    } else {
      viewerCache.delete(tabId);
    }

    directValueTreeCache.delete(tabId);
    clearDirectValueWarmup(tabId);
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
            viewerData,
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
    const rawViewerData = rawText.length >= LARGE_FILE_THRESHOLD ? buildLargeRawViewerData(rawText) : null;
    const formattedPatch = patchCachedFormattedNode(tabId, text, path, rawText);

    nodeEditCache.delete(tabId);

    return {
      rawText,
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
