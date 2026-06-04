import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type { LargeJsonViewerData, WorkerRequestMessage } from '../types/jsonTool';
import { shouldUseDedicatedRightViewer } from '../utils/jsonDocumentMetrics';
import { formatJsonText, repairJsonText } from '../utils/jsonFormat';
import { buildLargeRawViewerData } from '../utils/largeRawViewerData';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';
import { postRepairResult, postTextResult, readMessageText } from './jsonWorkerTextPayload';

type FormatWorkerRequest = Extract<WorkerRequestMessage, { type: 'format' | 'repair' }>;

interface StructureCacheEntry {
  directLocate?: boolean;
  directLocateMode?: 'identity' | 'token-search';
  formattedText?: string;
  formattedTree?: unknown;
  rawText?: string;
  rawTree?: unknown;
  requestId: number;
  tokenLocateCache?: { tokenOffsetsByToken: Map<string, number[]> };
  viewerData?: LargeJsonViewerData | null;
}

interface ViewerCacheEntry {
  formattedText: string;
  requestId: number;
  viewerData: LargeJsonViewerData;
}

interface JsonWorkerFormatOperationsArgs {
  cancelInteractiveRequests: (tabId: string) => void;
  clearDeferredStructureWarmup: (tabId: string) => void;
  clearDirectValueWarmup: (tabId: string) => void;
  directValueTreeCache: Map<string, unknown>;
  editJsonCache: Map<string, { originalText?: string }>;
  ensureStructureTrees: (tabId: string, cached: StructureCacheEntry) => boolean;
  latestFormatRequestByTab: Map<string, number>;
  nodeEditCache: Map<string, unknown>;
  scheduleDeferredStructureWarmup: (tabId: string, requestId: number, delayMs?: number) => void;
  scheduleDirectValueTreeWarmup: (tabId: string, requestId: number, text: string) => void;
  structureCache: Map<string, StructureCacheEntry>;
  viewerCache: Map<string, ViewerCacheEntry>;
}

interface BuildFormatArtifactsArgs {
  buildViewer: boolean;
  deferStructure: boolean;
  enableDirectLocate: boolean;
  enableStructure: boolean;
  formatted: string;
  normalizedNestedString: boolean;
  requestId: number;
  sourceText: string;
  structureWarmupDelayMs?: number;
  tabId: string;
}

function postWorkerMessage(message: Record<string, unknown>) {
  postMessage(message);
}

export function createJsonWorkerFormatOperations({
  cancelInteractiveRequests,
  clearDeferredStructureWarmup,
  clearDirectValueWarmup,
  directValueTreeCache,
  editJsonCache,
  ensureStructureTrees,
  latestFormatRequestByTab,
  nodeEditCache,
  scheduleDeferredStructureWarmup,
  scheduleDirectValueTreeWarmup,
  structureCache,
  viewerCache,
}: JsonWorkerFormatOperationsArgs) {
  function prepareFormatRequest(tabId: string, requestId: number, sourceText: string) {
    latestFormatRequestByTab.set(tabId, requestId);
    cancelInteractiveRequests(tabId);
    clearDirectValueWarmup(tabId);
    clearDeferredStructureWarmup(tabId);
    const cachedEditJson = editJsonCache.get(tabId);
    if (cachedEditJson?.originalText !== sourceText) {
      editJsonCache.delete(tabId);
    }
    nodeEditCache.delete(tabId);
    viewerCache.delete(tabId);
    directValueTreeCache.delete(tabId);
  }

  function buildFormatArtifacts({
    requestId,
    tabId,
    sourceText,
    formatted,
    normalizedNestedString,
    enableStructure,
    enableDirectLocate,
    deferStructure,
    buildViewer,
    structureWarmupDelayMs,
  }: BuildFormatArtifactsArgs) {
    const shouldBuildViewer = buildViewer || shouldUseDedicatedRightViewer(sourceText, formatted);

    if (shouldBuildViewer) {
      setTimeout(() => {
        if (latestFormatRequestByTab.get(tabId) !== requestId) {
          return;
        }

        const viewerIndexStartedAt = performance.now();
        const viewerData = buildLargeViewerData(formatted);
        const viewerIndexMs = performance.now() - viewerIndexStartedAt;
        if (viewerData) {
          viewerCache.set(tabId, {
            requestId,
            formattedText: formatted,
            viewerData,
          });
        } else {
          viewerCache.delete(tabId);
        }

        if (!enableStructure && enableDirectLocate && !normalizedNestedString) {
          if (viewerData) {
            structureCache.set(tabId, {
              requestId,
              directLocate: true,
              directLocateMode: sourceText === formatted ? 'identity' : 'token-search',
              rawText: sourceText === formatted ? undefined : sourceText,
              formattedText: formatted,
              viewerData,
              tokenLocateCache: { tokenOffsetsByToken: new Map() },
            });
            postWorkerMessage({
              type: 'structure-ready',
              requestId,
              tabId,
              ready: true,
            });
          } else {
            structureCache.delete(tabId);
            postWorkerMessage({
              type: 'structure-ready',
              requestId,
              tabId,
              ready: false,
            });
          }
        }

        postWorkerMessage({
          type: 'viewer-ready',
          requestId,
          tabId,
          viewerData,
          viewerIndexMs,
        });

        if (viewerData && !deferStructure) {
          scheduleDirectValueTreeWarmup(tabId, requestId, formatted);
        }
      }, 0);
    } else {
      viewerCache.delete(tabId);
      postWorkerMessage({
        type: 'viewer-ready',
        requestId,
        tabId,
        viewerData: null,
        viewerIndexMs: null,
      });
    }

    if (normalizedNestedString) {
      structureCache.delete(tabId);
      postWorkerMessage({
        type: 'structure-ready',
        requestId,
        tabId,
        ready: false,
      });
      return;
    }

    if (!enableStructure && enableDirectLocate && !buildViewer) {
      structureCache.delete(tabId);
      postWorkerMessage({
        type: 'structure-ready',
        requestId,
        tabId,
        ready: false,
      });
      return;
    }

    if (!enableStructure) {
      if (enableDirectLocate) {
        return;
      }

      structureCache.delete(tabId);
      postWorkerMessage({
        type: 'structure-ready',
        requestId,
        tabId,
        ready: false,
      });
      return;
    }

    structureCache.set(tabId, {
      requestId,
      rawText: sourceText,
      formattedText: formatted,
      rawTree: undefined,
      formattedTree: undefined,
    });

    if (deferStructure) {
      scheduleDeferredStructureWarmup(tabId, requestId, structureWarmupDelayMs);
      return;
    }

    setTimeout(() => {
      const current = structureCache.get(tabId);
      if (!current || current.requestId !== requestId) {
        return;
      }

      const ready = ensureStructureTrees(tabId, current);
      const latest = structureCache.get(tabId);
      if (!latest || latest.requestId !== requestId) {
        return;
      }

      postWorkerMessage({
        type: 'structure-ready',
        requestId,
        tabId,
        ready,
      });
    }, 0);
  }

  function clearFormatFailureArtifacts(tabId: string) {
    structureCache.delete(tabId);
    viewerCache.delete(tabId);
    directValueTreeCache.delete(tabId);
    clearDeferredStructureWarmup(tabId);
  }

  function handleFormatMessage(message: FormatWorkerRequest) {
    const { requestId, tabId, enableStructure, enableDirectLocate, deferStructure = false, buildViewer } = message;
    const text = readMessageText(message);
    prepareFormatRequest(tabId, requestId, text);
    try {
      const rawViewerData = text.length >= LARGE_FILE_THRESHOLD ? buildLargeRawViewerData(text) : null;
      const { formatted, normalizedNestedString } = formatJsonText(text);
      postTextResult(
        {
          type: 'format-result',
          requestId,
          tabId,
          success: true,
          rawViewerData,
        },
        formatted
      );

      buildFormatArtifacts({
        requestId,
        tabId,
        sourceText: text,
        formatted,
        normalizedNestedString,
        enableStructure,
        enableDirectLocate,
        deferStructure,
        buildViewer,
        structureWarmupDelayMs: message.structureWarmupDelayMs,
      });
    } catch (err) {
      clearFormatFailureArtifacts(tabId);
      postWorkerMessage({
        type: 'format-result',
        requestId,
        tabId,
        success: false,
        error: err instanceof Error ? err.message : 'JSON 解析失败',
      });
    }
  }

  function handleRepairMessage(message: FormatWorkerRequest) {
    const { requestId, tabId, enableStructure, enableDirectLocate, deferStructure = false, buildViewer } = message;
    const text = readMessageText(message);
    prepareFormatRequest(tabId, requestId, text);
    try {
      const { repaired, formatted, normalizedNestedString } = repairJsonText(text);
      const rawViewerData = repaired.length >= LARGE_FILE_THRESHOLD ? buildLargeRawViewerData(repaired) : null;

      postRepairResult(
        {
          type: 'repair-result',
          requestId,
          tabId,
          success: true,
          rawViewerData,
        },
        formatted,
        repaired
      );

      buildFormatArtifacts({
        requestId,
        tabId,
        sourceText: repaired,
        formatted,
        normalizedNestedString,
        enableStructure,
        enableDirectLocate,
        deferStructure,
        buildViewer,
        structureWarmupDelayMs: message.structureWarmupDelayMs,
      });
    } catch (err) {
      clearFormatFailureArtifacts(tabId);
      postWorkerMessage({
        type: 'repair-result',
        requestId,
        tabId,
        success: false,
        error: err instanceof Error ? err.message : 'JSON 修复失败',
      });
    }
  }

  return {
    buildFormatArtifacts,
    handleFormatMessage,
    handleRepairMessage,
    prepareFormatRequest,
  };
}
