/* eslint-disable no-restricted-globals */
import { createJsonNodeEditOperations } from './jsonNodeEditOperations.ts';
import { createJsonWorkerEditJsonOperations } from './jsonWorkerEditJsonOperations.ts';
import { getJsonWorkerMessageHandler, isJsonWorkerRequestMessage } from '../utils/jsonWorkerMessageRouting';
import { createJsonWorkerSearchOperations, getSearchRequestKey } from './jsonWorkerSearchOperations.ts';
import { createJsonWorkerLocateOperations, getLocateCandidateOffsets } from './jsonWorkerLocateOperations.ts';
import { createJsonWorkerStructureOperations } from './jsonWorkerStructureOperations.ts';
import { createJsonWorkerFormatOperations } from './jsonWorkerFormatOperations.ts';
import { releaseJsonWorkerTransientCaches } from './jsonWorkerCacheLifecycle.ts';

const structureCache = new Map();
const viewerCache = new Map();
const deferredStructureWarmupTimers = new Map();
const editJsonCache = new Map();
const nodeEditCache = new Map();
const rawSearchCache = new Map();
const rawDocumentCache = new Map();
const latestFormatRequestByTab = new Map();
const latestSearchRequestByKey = new Map();
const latestLocateRequestByTab = new Map();
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

function handleClearStructureMessage(message) {
  clearDeferredStructureWarmup(message.tabId);
  structureCache.delete(message.tabId);
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

const workerMessageHandlers = {
  'clear-structure': handleClearStructureMessage,
  'edit-json': jsonWorkerEditJsonOperations.handleEditJsonMessage,
  format: jsonWorkerFormatOperations.handleFormatMessage,
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
