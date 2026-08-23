import { parseTree } from 'jsonc-parser';
import type { Node } from 'jsonc-parser';
import { getDeferredStructureWarmupDelayMs } from '../utils/jsonWorkerPlan';
import { getTextByteLength } from './jsonWorkerTextPayload';

interface StructureCacheEntry {
  directLocate?: boolean;
  formattedText?: string;
  formattedTree?: Node;
  rawText?: string;
  rawTree?: Node;
  requestId: number;
}

interface JsonWorkerStructureOperationsArgs {
  deferredStructureWarmupTimers: Map<string, ReturnType<typeof setTimeout>>;
  latestFormatRequestByTab: Map<string, number>;
  structureCache: Map<string, StructureCacheEntry>;
}

export function createJsonWorkerStructureOperations({
  deferredStructureWarmupTimers,
  latestFormatRequestByTab,
  structureCache,
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
      if (typeof cached.formattedText !== 'string') {
        return false;
      }

      cached.formattedTree = parseTree(cached.formattedText) ?? undefined;
    }

    structureCache.set(tabId, cached);
    return Boolean(cached.rawTree && cached.formattedTree);
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

  return {
    clearDeferredStructureWarmup,
    ensureStructureTrees,
    getStructureWarmupDelayForTexts,
    scheduleDeferredStructureWarmup,
  };
}

export type { StructureCacheEntry };
