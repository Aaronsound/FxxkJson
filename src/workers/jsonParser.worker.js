/* eslint-disable no-restricted-globals */
import { createJsonNodeEditOperations } from './jsonNodeEditOperations';
import { createJsonWorkerEditJsonOperations } from './jsonWorkerEditJsonOperations';
import { getJsonWorkerMessageHandler, isJsonWorkerRequestMessage } from '../utils/jsonWorkerMessageRouting';
import { createJsonWorkerSearchOperations, getSearchRequestKey } from './jsonWorkerSearchOperations';
import { createJsonWorkerLocateOperations, getLocateCandidateOffsets } from './jsonWorkerLocateOperations';
import { createJsonWorkerStructureOperations } from './jsonWorkerStructureOperations';
import { createJsonWorkerFormatOperations } from './jsonWorkerFormatOperations';

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
const jsonWorkerFormatOperations = createJsonWorkerFormatOperations({
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
});

function cancelInteractiveRequests(tabId) {
  latestLocateRequestByTab.delete(tabId);
  latestSearchRequestByKey.delete(getSearchRequestKey(tabId, 'left'));
  latestSearchRequestByKey.delete(getSearchRequestKey(tabId, 'right'));
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

const workerMessageHandlers = {
  'clear-structure': handleClearStructureMessage,
  'edit-json': jsonWorkerEditJsonOperations.handleEditJsonMessage,
  format: jsonWorkerFormatOperations.handleFormatMessage,
  locate: jsonWorkerLocateOperations.handleLocateMessage,
  'locate-right-direct': jsonWorkerLocateOperations.handleLocateRightDirectMessage,
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
