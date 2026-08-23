import { parseTree } from 'jsonc-parser';
import type { Node } from 'jsonc-parser';
import type { LargeJsonLineIndex } from '../types/jsonTool';
import { getDeferredStructureWarmupDelayMs } from '../utils/jsonWorkerPlan';
import { getTextByteLength } from './jsonWorkerTextPayload';

const DIRECT_VALUE_TREE_PREWARM_MAX_LENGTH = 5 * 1024 * 1024;

interface StructureCacheEntry {
  directLocate?: boolean;
  formattedText?: string;
  formattedTree?: Node;
  rawText?: string;
  rawTree?: Node;
  requestId: number;
}

interface ViewerCacheEntry {
  formattedText?: string;
  requestId?: number;
  viewerData?: LargeJsonLineIndex;
}

interface DirectValueTreeCacheEntry {
  formattedTree: Node | undefined;
  requestId: number;
}

interface JsonWorkerStructureOperationsArgs {
  directValueTreeCache: Map<string, DirectValueTreeCacheEntry>;
  directValueWarmupTimers: Map<string, ReturnType<typeof setTimeout>>;
  deferredStructureWarmupTimers: Map<string, ReturnType<typeof setTimeout>>;
  latestFormatRequestByTab: Map<string, number>;
  structureCache: Map<string, StructureCacheEntry>;
  viewerCache: Map<string, ViewerCacheEntry>;
}

export function createJsonWorkerStructureOperations({
  directValueTreeCache,
  directValueWarmupTimers,
  deferredStructureWarmupTimers,
  latestFormatRequestByTab,
  structureCache,
  viewerCache,
}: JsonWorkerStructureOperationsArgs) {
  function getStructureWarmupDelayForTexts(
    rawText: string | null | undefined,
    formattedText: string | null | undefined,
    baseDelayMs: number
  ) {
    return getDeferredStructureWarmupDelayMs(
      Math.max(getTextByteLength(rawText ?? ''), getTextByteLength(formattedText ?? '')),
      baseDelayMs
    );
  }

  function ensureStructureTrees(tabId: string, cached: StructureCacheEntry | null | undefined) {
    if (!cached || cached.directLocate) {
      return Boolean(cached?.directLocate);
    }

    if (!cached.rawTree) {
      if (typeof cached.rawText !== 'string') {
        return false;
      }

      cached.rawTree = parseTree(cached.rawText) ?? undefined;
      cached.rawText = undefined;
    }

    if (!cached.formattedTree) {
      const cachedDirectTree = directValueTreeCache.get(tabId);
      if (cachedDirectTree?.requestId === cached.requestId) {
        cached.formattedTree = cachedDirectTree.formattedTree;
      }
    }

    if (!cached.formattedTree) {
      if (typeof cached.formattedText !== 'string') {
        return false;
      }

      cached.formattedTree = parseTree(cached.formattedText) ?? undefined;
    }

    if (cached.formattedTree) {
      directValueTreeCache.set(tabId, {
        requestId: cached.requestId,
        formattedTree: cached.formattedTree,
      });
    }

    structureCache.set(tabId, cached);
    return Boolean(cached.rawTree && cached.formattedTree);
  }

  function getDirectValueTree(tabId: string, requestId: number, text: string) {
    const cachedTree = directValueTreeCache.get(tabId);
    if (cachedTree && cachedTree.requestId === requestId) {
      return cachedTree.formattedTree;
    }

    const formattedTree = parseTree(text);
    directValueTreeCache.set(tabId, {
      requestId,
      formattedTree,
    });
    return formattedTree;
  }

  function clearDirectValueWarmup(tabId: string) {
    const timerId = directValueWarmupTimers.get(tabId);
    if (timerId) {
      clearTimeout(timerId);
      directValueWarmupTimers.delete(tabId);
    }
  }

  function clearDeferredStructureWarmup(tabId: string) {
    const timerId = deferredStructureWarmupTimers.get(tabId);
    if (timerId) {
      clearTimeout(timerId);
      deferredStructureWarmupTimers.delete(tabId);
    }
  }

  function scheduleDeferredStructureWarmup(tabId: string, requestId: number, delayMs = 350) {
    clearDeferredStructureWarmup(tabId);

    const timerId = setTimeout(() => {
      deferredStructureWarmupTimers.delete(tabId);
      const current = structureCache.get(tabId);

      if (latestFormatRequestByTab.get(tabId) !== requestId || !current || current.requestId !== requestId) {
        return;
      }

      let ready = false;
      try {
        ready = ensureStructureTrees(tabId, current);
      } catch {
        structureCache.delete(tabId);
      }

      const latest = structureCache.get(tabId);
      if (latestFormatRequestByTab.get(tabId) !== requestId || (latest && latest.requestId !== requestId)) {
        return;
      }

      postMessage({
        type: 'structure-ready',
        requestId,
        tabId,
        ready,
      });
    }, delayMs);

    deferredStructureWarmupTimers.set(tabId, timerId);
  }

  function scheduleDirectValueTreeWarmup(tabId: string, requestId: number, text: string) {
    clearDirectValueWarmup(tabId);

    if (typeof text !== 'string' || text.length > DIRECT_VALUE_TREE_PREWARM_MAX_LENGTH) {
      return;
    }

    const timerId = setTimeout(() => {
      directValueWarmupTimers.delete(tabId);
      const cachedViewer = viewerCache.get(tabId);

      if (
        latestFormatRequestByTab.get(tabId) !== requestId ||
        !cachedViewer ||
        cachedViewer.requestId !== requestId ||
        cachedViewer.formattedText !== text
      ) {
        return;
      }

      try {
        getDirectValueTree(tabId, requestId, text);
      } catch {
        directValueTreeCache.delete(tabId);
      }
    }, 250);

    directValueWarmupTimers.set(tabId, timerId);
  }

  return {
    clearDeferredStructureWarmup,
    clearDirectValueWarmup,
    ensureStructureTrees,
    getDirectValueTree,
    getStructureWarmupDelayForTexts,
    scheduleDeferredStructureWarmup,
    scheduleDirectValueTreeWarmup,
  };
}

export type { DirectValueTreeCacheEntry, StructureCacheEntry, ViewerCacheEntry };
