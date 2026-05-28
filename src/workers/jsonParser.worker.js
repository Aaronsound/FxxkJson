/* eslint-disable no-restricted-globals */
/** @typedef {import('../types/jsonTool').WorkerRequestMessage} WorkerRequestMessage */
import { buildLargeViewerData } from '../utils/largeJsonViewerData';
import { buildLargeRawViewerData } from '../utils/largeRawViewerData';
import { formatJsonText, repairJsonText } from '../utils/jsonFormat';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { shouldUseDedicatedRightViewer } from '../utils/jsonDocumentMetrics';
import { createJsonNodeEditOperations } from './jsonNodeEditOperations';
import { createJsonWorkerEditJsonOperations } from './jsonWorkerEditJsonOperations';
import { getJsonWorkerMessageHandler, isJsonWorkerRequestMessage } from '../utils/jsonWorkerMessageRouting';
import { postRepairResult, postTextResult, readMessageText } from './jsonWorkerTextPayload';
import { createJsonWorkerSearchOperations, getSearchRequestKey } from './jsonWorkerSearchOperations';
import { createJsonWorkerLocateOperations, getLocateCandidateOffsets } from './jsonWorkerLocateOperations';
import { createJsonWorkerStructureOperations } from './jsonWorkerStructureOperations';

const structureCache = new Map();
const viewerCache = new Map();
const directValueTreeCache = new Map();
const directValueWarmupTimers = new Map();
const deferredStructureWarmupTimers = new Map();
const editJsonCache = new Map();
const nodeEditCache = new Map();
const rawSearchCache = new Map();
const latestFormatRequestByTab = new Map();
const latestSearchRequestByKey = new Map();
const latestLocateRequestByTab = new Map();
const {
  clearDeferredStructureWarmup,
  clearDirectValueWarmup,
  ensureStructureTrees,
  getDirectValueTree,
  getStructureWarmupDelayForTexts,
  scheduleDeferredStructureWarmup,
  scheduleDirectValueTreeWarmup,
} = createJsonWorkerStructureOperations({
  directValueTreeCache,
  directValueWarmupTimers,
  deferredStructureWarmupTimers,
  latestFormatRequestByTab,
  structureCache,
  viewerCache,
});

const jsonNodeEditOperations = createJsonNodeEditOperations({
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
});

const jsonWorkerEditJsonOperations = createJsonWorkerEditJsonOperations({
  editJsonCache,
  jsonNodeEditOperations,
});
const jsonWorkerSearchOperations = createJsonWorkerSearchOperations({
  latestSearchRequestByKey,
  rawSearchCache,
  viewerCache,
});
const jsonWorkerLocateOperations = createJsonWorkerLocateOperations({
  ensureStructureTrees,
  getDirectValueTree,
  latestLocateRequestByTab,
  structureCache,
  viewerCache,
});

function cancelInteractiveRequests(tabId) {
  latestLocateRequestByTab.delete(tabId);
  latestSearchRequestByKey.delete(getSearchRequestKey(tabId, 'left'));
  latestSearchRequestByKey.delete(getSearchRequestKey(tabId, 'right'));
}

function prepareFormatRequest(tabId, requestId, sourceText) {
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
}) {
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
          postMessage({
            type: 'structure-ready',
            requestId,
            tabId,
            ready: true,
          });
        } else {
          structureCache.delete(tabId);
          postMessage({
            type: 'structure-ready',
            requestId,
            tabId,
            ready: false,
          });
        }
      }

      postMessage({
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
    postMessage({
      type: 'viewer-ready',
      requestId,
      tabId,
      viewerData: null,
      viewerIndexMs: null,
    });
  }

  if (normalizedNestedString) {
    structureCache.delete(tabId);
    postMessage({
      type: 'structure-ready',
      requestId,
      tabId,
      ready: false,
    });
    return;
  }

  if (!enableStructure && enableDirectLocate && !buildViewer) {
    structureCache.delete(tabId);
    postMessage({
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
    postMessage({
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

    postMessage({
      type: 'structure-ready',
      requestId,
      tabId,
      ready,
    });
  }, 0);
}

function handleClearStructureMessage(message) {
  clearDirectValueWarmup(message.tabId);
  clearDeferredStructureWarmup(message.tabId);
  structureCache.delete(message.tabId);
  viewerCache.delete(message.tabId);
  directValueTreeCache.delete(message.tabId);
  editJsonCache.delete(message.tabId);
  nodeEditCache.delete(message.tabId);
  rawSearchCache.delete(message.tabId);
  latestFormatRequestByTab.delete(message.tabId);
  cancelInteractiveRequests(message.tabId);
}

function handleFormatMessage(message) {
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
    structureCache.delete(tabId);
    viewerCache.delete(tabId);
    directValueTreeCache.delete(tabId);
    clearDeferredStructureWarmup(tabId);
    postMessage({
      type: 'format-result',
      requestId,
      tabId,
      success: false,
      error: err instanceof Error ? err.message : 'JSON 解析失败',
    });
  }
}

function handleRepairMessage(message) {
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
    structureCache.delete(tabId);
    viewerCache.delete(tabId);
    directValueTreeCache.delete(tabId);
    clearDeferredStructureWarmup(tabId);
    postMessage({
      type: 'repair-result',
      requestId,
      tabId,
      success: false,
      error: err instanceof Error ? err.message : 'JSON 修复失败',
    });
  }
}

const workerMessageHandlers = {
  'clear-structure': handleClearStructureMessage,
  'edit-json': jsonWorkerEditJsonOperations.handleEditJsonMessage,
  format: handleFormatMessage,
  locate: jsonWorkerLocateOperations.handleLocateMessage,
  'locate-right-direct': jsonWorkerLocateOperations.handleLocateRightDirectMessage,
  repair: handleRepairMessage,
  search: jsonWorkerSearchOperations.handleSearchMessage,
};

self.onmessage = (event) => {
  if (!isJsonWorkerRequestMessage(event.data)) {
    return;
  }

  /** @type {WorkerRequestMessage} */
  const message = event.data;
  const handler = getJsonWorkerMessageHandler(workerMessageHandlers, message);
  handler?.(message);
};
