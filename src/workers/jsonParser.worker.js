/* eslint-disable no-restricted-globals */

import { getJsonWorkerMessageHandler, isJsonWorkerRequestMessage } from '../utils/jsonWorkerMessageRouting';
import { createJsonNodeEditOperations } from './jsonNodeEditOperations.ts';
import { BoundedLruMap, MAX_RETAINED_LARGE_VIEWER_CACHES } from './jsonWorkerBoundedCache.ts';
import { releaseJsonWorkerTransientCaches } from './jsonWorkerCacheLifecycle.ts';
import { createJsonWorkerEditJsonOperations } from './jsonWorkerEditJsonOperations.ts';
import { createJsonWorkerFormatOperations } from './jsonWorkerFormatOperations.ts';
import { createJsonWorkerLocateOperations, getLocateCandidateOffsets } from './jsonWorkerLocateOperations.ts';
import { createJsonWorkerSearchOperations, getSearchRequestKey } from './jsonWorkerSearchOperations.ts';
import { createJsonWorkerStructureOperations } from './jsonWorkerStructureOperations.ts';
import { readNamedMessageText } from './jsonWorkerTextPayload.ts';

const structureCache = new Map();
const deferredStructureWarmupTimers = new Map();
const editJsonCache = new Map();
const nodeEditCache = new Map();
const rawSearchCache = new Map();
const rawDocumentCache = new Map();
const latestFormatRequestByTab = new Map();
const latestSearchRequestByKey = new Map();
const latestLocateRequestByTab = new Map();
const viewerCache = new BoundedLruMap({
  maxEntries: MAX_RETAINED_LARGE_VIEWER_CACHES,
  onEvict(tabId) {
    clearDeferredStructureWarmup(tabId);
    structureCache.delete(tabId);
    editJsonCache.delete(tabId);
    nodeEditCache.delete(tabId);
    rawSearchCache.delete(tabId);
    rawDocumentCache.delete(tabId);
    latestFormatRequestByTab.delete(tabId);
    cancelInteractiveRequests(tabId);
    postMessage({
      type: 'viewer-cache-evicted',
      requestId: 0,
      tabId,
    });
  },
});
const {
  clearDeferredStructureWarmup,
  ensureStructureTrees,
  getStructureWarmupDelayForByteLength,
  scheduleDeferredStructureWarmup,
} = createJsonWorkerStructureOperations({
  deferredStructureWarmupTimers,
  latestFormatRequestByTab,
  structureCache,
});

const jsonNodeEditOperations = createJsonNodeEditOperations({
  clearDeferredStructureWarmup,
  getLocateCandidateOffsets,
  getStructureWarmupDelayForByteLength,
  latestFormatRequestByTab,
  nodeEditCache,
  rawDocumentCache,
  scheduleDeferredStructureWarmup,
  structureCache,
  viewerCache,
});

const jsonWorkerEditJsonOperations = createJsonWorkerEditJsonOperations({
  editJsonCache,
  jsonNodeEditOperations,
  rawDocumentCache,
  structureCache,
  viewerCache,
});
const jsonWorkerSearchOperations = createJsonWorkerSearchOperations({
  editJsonCache,
  latestSearchRequestByKey,
  rawSearchCache,
  structureCache,
  viewerCache,
});
const jsonWorkerLocateOperations = createJsonWorkerLocateOperations({
  ensureStructureTrees,
  latestLocateRequestByTab,
  structureCache,
  viewerCache,
});
const jsonWorkerFormatOperations = createJsonWorkerFormatOperations({
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
});

function cancelInteractiveRequests(tabId) {
  latestLocateRequestByTab.delete(tabId);
  latestSearchRequestByKey.delete(getSearchRequestKey(tabId, 'left'));
  latestSearchRequestByKey.delete(getSearchRequestKey(tabId, 'right'));
}

function handleClearLocateCacheMessage(message) {
  clearDeferredStructureWarmup(message.tabId);
  structureCache.delete(message.tabId);
  latestLocateRequestByTab.delete(message.tabId);
}

function handleClearTabCacheMessage(message) {
  handleClearLocateCacheMessage(message);
  viewerCache.delete(message.tabId);
  editJsonCache.delete(message.tabId);
  nodeEditCache.delete(message.tabId);
  rawSearchCache.delete(message.tabId);
  rawDocumentCache.delete(message.tabId);
  latestFormatRequestByTab.delete(message.tabId);
  cancelInteractiveRequests(message.tabId);
}

function handleReleaseTransientCacheMessage(message) {
  releaseJsonWorkerTransientCaches(message.tabId, {
    cancelInteractiveRequests,
    editJsonCache,
    nodeEditCache,
    rawDocumentCache,
    rawSearchCache,
  });
}

function handleHydrateViewerCacheMessage(message) {
  const formattedText = readNamedMessageText(message, 'formattedText', 'formattedTextBuffer');
  if (typeof formattedText !== 'string' || !(message.viewerData?.lineStarts instanceof Uint32Array)) {
    return;
  }

  const rawText = message.enableDirectLocate ? readNamedMessageText(message, 'rawText', 'rawTextBuffer') : undefined;
  const cacheRequestId = latestFormatRequestByTab.get(message.tabId) ?? message.requestId;
  viewerCache.set(message.tabId, {
    requestId: cacheRequestId,
    formattedText,
    viewerData: message.viewerData,
  });

  if (message.enableDirectLocate && typeof rawText === 'string') {
    const isIdentityFormat = rawText === formattedText;
    structureCache.set(message.tabId, {
      requestId: cacheRequestId,
      directLocate: true,
      directLocateMode: isIdentityFormat ? 'identity' : 'token-search',
      rawText: isIdentityFormat ? undefined : rawText,
      formattedText,
      viewerData: message.viewerData,
      tokenLocateCache: { tokenOffsetsByToken: new Map() },
    });
  } else {
    structureCache.delete(message.tabId);
  }

  postMessage({
    type: 'viewer-cache-restored',
    requestId: message.requestId,
    tabId: message.tabId,
  });
}

const workerMessageHandlers = {
  'clear-locate-cache': handleClearLocateCacheMessage,
  'clear-tab-cache': handleClearTabCacheMessage,
  'edit-json': jsonWorkerEditJsonOperations.handleEditJsonMessage,
  format: jsonWorkerFormatOperations.handleFormatMessage,
  'hydrate-viewer-cache': handleHydrateViewerCacheMessage,
  locate: jsonWorkerLocateOperations.handleLocateMessage,
  'locate-right-direct': jsonWorkerLocateOperations.handleLocateRightDirectMessage,
  'release-transient-cache': handleReleaseTransientCacheMessage,
  repair: jsonWorkerFormatOperations.handleRepairMessage,
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
