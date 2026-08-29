import type { LargeJsonLineIndex, WorkerRequestMessage } from '../types/jsonTool';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import {
  type JsonDocumentMetrics,
  measureJsonDocument,
  shouldUseDedicatedRightViewerForMetrics,
} from '../utils/jsonDocumentMetrics';
import { formatJsonText, repairJsonText } from '../utils/jsonFormat';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';
import { buildLargeRawViewerData } from '../utils/largeRawViewerData';
import type { LightweightLocateCache } from '../utils/lightweightLocate';
import type { RawDocumentCacheEntry } from './jsonNodeEditOperations';
import {
  copyLargeViewerLineIndex,
  getLargeViewerTransferables,
  postRepairResult,
  postTextResult,
  readMessageText,
} from './jsonWorkerTextPayload';

type FormatWorkerRequest = Extract<WorkerRequestMessage, { type: 'format' | 'repair' }>;

interface StructureCacheEntry {
  directLocate?: boolean;
  directLocateMode?: 'identity' | 'token-search';
  formattedText?: string;
  formattedMetrics?: JsonDocumentMetrics;
  formattedTree?: unknown;
  rawText?: string;
  rawMetrics?: JsonDocumentMetrics;
  rawTree?: unknown;
  requestId: number;
  tokenLocateCache?: LightweightLocateCache;
  viewerData?: LargeJsonLineIndex | null;
}

interface ViewerCacheEntry {
  formattedText: string;
  formattedMetrics?: JsonDocumentMetrics;
  requestId: number;
  viewerData: LargeJsonLineIndex;
}

interface JsonWorkerFormatOperationsArgs {
  cancelInteractiveRequests: (tabId: string) => void;
  clearDeferredStructureWarmup: (tabId: string) => void;
  editJsonCache: Map<string, { originalText?: string }>;
  ensureStructureTrees: (tabId: string, cached: StructureCacheEntry) => boolean;
  latestFormatRequestByTab: Map<string, number>;
  nodeEditCache: Map<string, unknown>;
  rawDocumentCache: Map<string, RawDocumentCacheEntry>;
  scheduleDeferredStructureWarmup: (tabId: string, requestId: number, delayMs?: number) => void;
  structureCache: Map<string, StructureCacheEntry>;
  viewerCache: Map<string, ViewerCacheEntry>;
}

interface BuildFormatArtifactsArgs {
  buildViewer: boolean;
  deferStructure: boolean;
  enableDirectLocate: boolean;
  enableStructure: boolean;
  formatted: string;
  formattedMetrics: JsonDocumentMetrics;
  normalizedNestedString: boolean;
  requestId: number;
  sourceText: string;
  sourceMetrics: JsonDocumentMetrics;
  structureWarmupDelayMs?: number;
  tabId: string;
}

function postWorkerMessage(message: Record<string, unknown>, transfer: Transferable[] = []) {
  if (transfer.length > 0) {
    (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(
      message,
      transfer
    );
    return;
  }

  postMessage(message);
}

export function createJsonWorkerFormatOperations({
  cancelInteractiveRequests,
  clearDeferredStructureWarmup,
  editJsonCache,
  ensureStructureTrees,
  latestFormatRequestByTab,
  nodeEditCache,
  rawDocumentCache,
  scheduleDeferredStructureWarmup,
  structureCache,
  viewerCache,
}: JsonWorkerFormatOperationsArgs) {
  function prepareFormatRequest(tabId: string, requestId: number, sourceText: string) {
    latestFormatRequestByTab.set(tabId, requestId);
    cancelInteractiveRequests(tabId);
    clearDeferredStructureWarmup(tabId);
    const cachedEditJson = editJsonCache.get(tabId);
    if (cachedEditJson?.originalText !== sourceText) {
      editJsonCache.delete(tabId);
    }
    nodeEditCache.delete(tabId);
    viewerCache.delete(tabId);
  }

  function buildFormatArtifacts({
    requestId,
    tabId,
    sourceText,
    sourceMetrics,
    formatted,
    formattedMetrics,
    normalizedNestedString,
    enableStructure,
    enableDirectLocate,
    deferStructure,
    buildViewer,
    structureWarmupDelayMs,
  }: BuildFormatArtifactsArgs) {
    const shouldBuildViewer = buildViewer || shouldUseDedicatedRightViewerForMetrics(sourceMetrics, formattedMetrics);

    if (shouldBuildViewer) {
      setTimeout(() => {
        if (latestFormatRequestByTab.get(tabId) !== requestId) {
          return;
        }

        const viewerIndexStartedAt = performance.now();
        // Reaching this branch already means the caller selected the dedicated
        // viewer by byte size, line count, or an explicit processing plan. A
        // large document with only a few extremely long lines still needs the
        // virtual viewer, so do not apply the line-count gate a second time.
        const viewerData = buildLargeViewerData(formatted, 0, formattedMetrics.lineCount);
        const viewerIndexMs = performance.now() - viewerIndexStartedAt;
        const workerViewerData = viewerData ? copyLargeViewerLineIndex(viewerData) : null;
        const isIdentityFormat =
          Boolean(viewerData) &&
          !enableStructure &&
          enableDirectLocate &&
          !normalizedNestedString &&
          sourceText === formatted;
        if (viewerData && workerViewerData) {
          viewerCache.set(tabId, {
            requestId,
            formattedText: formatted,
            formattedMetrics,
            viewerData: workerViewerData,
          });
        } else {
          viewerCache.delete(tabId);
        }

        if (!enableStructure && enableDirectLocate && !normalizedNestedString) {
          if (viewerData && workerViewerData) {
            structureCache.set(tabId, {
              requestId,
              directLocate: true,
              directLocateMode: isIdentityFormat ? 'identity' : 'token-search',
              rawText: isIdentityFormat ? undefined : sourceText,
              rawMetrics: sourceMetrics,
              formattedText: formatted,
              formattedMetrics,
              viewerData: workerViewerData,
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

        postWorkerMessage(
          {
            type: 'viewer-ready',
            requestId,
            tabId,
            viewerData,
            viewerIndexMs,
          },
          getLargeViewerTransferables(viewerData)
        );
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
      rawMetrics: sourceMetrics,
      formattedText: formatted,
      formattedMetrics,
      rawTree: undefined,
      formattedTree: undefined,
    });

    if (deferStructure) {
      scheduleDeferredStructureWarmup(tabId, requestId, structureWarmupDelayMs);
      return;
    }

    setTimeout(() => {
      if (latestFormatRequestByTab.get(tabId) !== requestId) {
        return;
      }

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
    clearDeferredStructureWarmup(tabId);
  }

  function handleFormatMessage(message: FormatWorkerRequest) {
    const { requestId, tabId, enableStructure, enableDirectLocate, deferStructure = false, buildViewer } = message;
    const text = readMessageText(message);
    prepareFormatRequest(tabId, requestId, text);
    try {
      const sourceMetrics = measureJsonDocument(text);
      const rawViewerData = sourceMetrics.textByteLength >= LARGE_FILE_THRESHOLD ? buildLargeRawViewerData(text) : null;
      const { formatted, normalizedNestedString } = formatJsonText(text);
      const formattedMetrics = measureJsonDocument(formatted);
      rawDocumentCache.set(tabId, {
        rawMetrics: sourceMetrics,
        rawRevision: message.rawRevision ?? null,
        rawText: text,
      });
      postTextResult(
        {
          type: 'format-result',
          requestId,
          tabId,
          success: true,
          rawViewerData,
          rawMetrics: sourceMetrics,
          formattedMetrics,
        },
        formatted,
        formattedMetrics.textByteLength
      );

      buildFormatArtifacts({
        requestId,
        tabId,
        sourceText: text,
        sourceMetrics,
        formatted,
        formattedMetrics,
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
      const sourceMetrics = measureJsonDocument(repaired);
      const formattedMetrics = measureJsonDocument(formatted);
      const rawViewerData =
        sourceMetrics.textByteLength >= LARGE_FILE_THRESHOLD ? buildLargeRawViewerData(repaired) : null;
      rawDocumentCache.set(tabId, {
        rawMetrics: sourceMetrics,
        rawRevision: typeof message.rawRevision === 'number' ? message.rawRevision + 1 : null,
        rawText: repaired,
      });

      postRepairResult(
        {
          type: 'repair-result',
          requestId,
          tabId,
          success: true,
          rawViewerData,
          rawMetrics: sourceMetrics,
          formattedMetrics,
        },
        formatted,
        repaired,
        formattedMetrics.textByteLength,
        sourceMetrics.textByteLength
      );

      buildFormatArtifacts({
        requestId,
        tabId,
        sourceText: repaired,
        sourceMetrics,
        formatted,
        formattedMetrics,
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
