/* eslint-disable no-restricted-globals */
/** @typedef {import('../types/jsonTool').WorkerRequestMessage} WorkerRequestMessage */
import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';
import {
  buildLargeViewerData,
} from '../utils/largeJsonViewerData';
import { buildLargeRawViewerData } from '../utils/largeRawViewerData';
import { formatJsonText, repairJsonText } from '../utils/jsonFormat';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { getDeferredStructureWarmupDelayMs } from '../utils/jsonWorkerPlan';
import { shouldUseDedicatedRightViewer } from '../utils/jsonDocumentMetrics';
import { createJsonNodeEditOperations } from './jsonNodeEditOperations';
import { createJsonWorkerEditJsonOperations } from './jsonWorkerEditJsonOperations';
import { getJsonWorkerMessageHandler } from '../utils/jsonWorkerMessageRouting';
import {
  getTextByteLength,
  postRepairResult,
  postTextResult,
  readMessageText,
} from './jsonWorkerTextPayload';
import {
  createJsonWorkerSearchOperations,
  getSearchRequestKey,
} from './jsonWorkerSearchOperations';
import {
  createJsonWorkerLocateOperations,
  getLocateCandidateOffsets,
  getResolvedNodes,
} from './jsonWorkerLocateOperations';

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
const DIRECT_VALUE_TREE_PREWARM_MAX_LENGTH = 5 * 1024 * 1024;

function getStructureWarmupDelayForTexts(rawText, formattedText, baseDelayMs) {
  return getDeferredStructureWarmupDelayMs(
    Math.max(getTextByteLength(rawText ?? ''), getTextByteLength(formattedText ?? '')),
    baseDelayMs
  );
}

function ensureStructureTrees(tabId, cached) {
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

function getDirectValueTree(tabId, requestId, text) {
  const cachedTree = directValueTreeCache.get(tabId);
  if (
    cachedTree
    && cachedTree.requestId === requestId
  ) {
    return cachedTree.formattedTree;
  }

  const formattedTree = parseTree(text);
  directValueTreeCache.set(tabId, {
    requestId,
    formattedTree,
  });
  return formattedTree;
}

function clearDirectValueWarmup(tabId) {
  const timerId = directValueWarmupTimers.get(tabId);
  if (timerId) {
    clearTimeout(timerId);
    directValueWarmupTimers.delete(tabId);
  }
}

function clearDeferredStructureWarmup(tabId) {
  const timerId = deferredStructureWarmupTimers.get(tabId);
  if (timerId) {
    clearTimeout(timerId);
    deferredStructureWarmupTimers.delete(tabId);
  }
}

function scheduleDeferredStructureWarmup(tabId, requestId, delayMs = 350) {
  clearDeferredStructureWarmup(tabId);

  const timerId = setTimeout(() => {
    deferredStructureWarmupTimers.delete(tabId);
    const current = structureCache.get(tabId);

    if (
      latestFormatRequestByTab.get(tabId) !== requestId
      || !current
      || current.requestId !== requestId
    ) {
      return;
    }

    let ready = false;
    try {
      ready = ensureStructureTrees(tabId, current);
    } catch {
      structureCache.delete(tabId);
    }

    const latest = structureCache.get(tabId);
    if (
      latestFormatRequestByTab.get(tabId) !== requestId
      || (latest && latest.requestId !== requestId)
    ) {
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

function scheduleDirectValueTreeWarmup(tabId, requestId, text) {
  clearDirectValueWarmup(tabId);

  if (typeof text !== 'string' || text.length > DIRECT_VALUE_TREE_PREWARM_MAX_LENGTH) {
    return;
  }

  const timerId = setTimeout(() => {
    directValueWarmupTimers.delete(tabId);
    const cachedViewer = viewerCache.get(tabId);

    if (
      latestFormatRequestByTab.get(tabId) !== requestId
      || !cachedViewer
      || cachedViewer.requestId !== requestId
      || cachedViewer.formattedText !== text
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
  const {
    requestId,
    tabId,
    enableStructure,
    enableDirectLocate,
    deferStructure = false,
    buildViewer,
  } = message;
  const text = readMessageText(message);
  prepareFormatRequest(tabId, requestId, text);
  try {
    const rawViewerData = text.length >= LARGE_FILE_THRESHOLD
      ? buildLargeRawViewerData(text)
      : null;
    const { formatted, normalizedNestedString } = formatJsonText(text);
    postTextResult({
      type: 'format-result',
      requestId,
      tabId,
      success: true,
      rawViewerData,
    }, formatted);

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
  const {
    requestId,
    tabId,
    enableStructure,
    enableDirectLocate,
    deferStructure = false,
    buildViewer,
  } = message;
  const text = readMessageText(message);
  prepareFormatRequest(tabId, requestId, text);
  try {
    const { repaired, formatted, normalizedNestedString } = repairJsonText(text);
    const rawViewerData = repaired.length >= LARGE_FILE_THRESHOLD
      ? buildLargeRawViewerData(repaired)
      : null;

    postRepairResult({
      type: 'repair-result',
      requestId,
      tabId,
      success: true,
      rawViewerData,
    }, formatted, repaired);

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

function handleReadValueMessage(message) {
  const { requestId, tabId, offset } = message;
  const cached = structureCache.get(tabId);

  try {
    if (!ensureStructureTrees(tabId, cached)) {
      postMessage({
        type: 'value-result',
        requestId,
        tabId,
        found: false,
        value: null,
      });
      return;
    }
  } catch {
    structureCache.delete(tabId);
    postMessage({
      type: 'value-result',
      requestId,
      tabId,
      found: false,
      value: null,
    });
    return;
  }

  const resolvedNodes = getResolvedNodes(cached, offset);

  if (!resolvedNodes || typeof cached?.formattedText !== 'string') {
    postMessage({
      type: 'value-result',
      requestId,
      tabId,
      found: false,
      value: null,
    });
    return;
  }

  const { rightNode } = resolvedNodes;
  // Copy the exact JSON literal under the cursor so pasting into a new tab
  // keeps valid JSON semantics for strings, numbers, arrays, objects, etc.
  const value = cached.formattedText.slice(
    rightNode.offset,
    rightNode.offset + rightNode.length
  );

  postMessage({
    type: 'value-result',
    requestId,
    tabId,
    found: true,
    value,
  });
}

function handleReadValueDirectMessage(message) {
  const { requestId, tabId, offset, text } = message;
  const cachedViewer = viewerCache.get(tabId);
  const sourceText = typeof text === 'string' && text
    ? text
    : cachedViewer?.formattedText;
  const sourceRequestId = cachedViewer?.requestId ?? requestId;

  if (typeof sourceText !== 'string' || !sourceText) {
    postMessage({
      type: 'value-result',
      requestId,
      tabId,
      found: false,
      value: null,
    });
    return;
  }

  try {
    const formattedTree = getDirectValueTree(tabId, sourceRequestId, sourceText);
    if (!formattedTree) {
      postMessage({
        type: 'value-result',
        requestId,
        tabId,
        found: false,
        value: null,
      });
      return;
    }

    const location = getLocation(sourceText, offset);
    const rightNode = findNodeAtLocation(formattedTree, location.path);

    if (!rightNode) {
      postMessage({
        type: 'value-result',
        requestId,
        tabId,
        found: false,
        value: null,
      });
      return;
    }

    postMessage({
      type: 'value-result',
      requestId,
      tabId,
      found: true,
      value: sourceText.slice(rightNode.offset, rightNode.offset + rightNode.length),
    });
  } catch {
    postMessage({
      type: 'value-result',
      requestId,
      tabId,
      found: false,
      value: null,
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
  'read-value': handleReadValueMessage,
  'read-value-direct': handleReadValueDirectMessage,
  search: jsonWorkerSearchOperations.handleSearchMessage,
};

self.onmessage = (event) => {
  /** @type {WorkerRequestMessage} */
  const message = event.data;
  const handler = getJsonWorkerMessageHandler(workerMessageHandlers, message);
  handler?.(message);
};
