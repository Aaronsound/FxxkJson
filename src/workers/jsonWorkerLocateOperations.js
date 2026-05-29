import { findNodeAtLocation, getLocation } from 'jsonc-parser';
import { formatJsonPath } from '../utils/jsonPath';
import { getLocateCandidateOffsets } from './jsonWorkerLocateCandidates';
import {
  getDirectLocateRange,
  getDirectRightLocateRange,
  getPathCalibratedDirectLocateRange,
  getRightOnlyLocateResult,
} from './jsonWorkerLocateRanges';

const LOCATE_REQUEST_DEBOUNCE_MS = 16;

export { getLocateCandidateOffsets };

export function getResolvedNodes(cached, offset) {
  if (!cached || typeof cached.formattedText !== 'string' || !cached.rawTree || !cached.formattedTree) {
    return null;
  }

  const candidateOffsets = getLocateCandidateOffsets(cached.formattedText, offset);

  for (const candidateOffset of candidateOffsets) {
    const location = getLocation(cached.formattedText, candidateOffset);
    const rightNode = findNodeAtLocation(cached.formattedTree, location.path);
    const leftNode = findNodeAtLocation(cached.rawTree, location.path);

    if (rightNode && leftNode) {
      return { rightNode, leftNode, path: location.path };
    }
  }

  return null;
}

export function createJsonWorkerLocateOperations({
  ensureStructureTrees,
  getDirectValueTree,
  latestLocateRequestByTab,
  structureCache,
  viewerCache,
}) {
  function isLatestLocateRequest(tabId, requestId) {
    return latestLocateRequestByTab.get(tabId) === requestId;
  }

  function postLocateResultIfLatest(payload) {
    if (!isLatestLocateRequest(payload.tabId, payload.requestId)) {
      return;
    }

    postMessage(payload);
  }

  function runLocateRequest(message) {
    const { requestId, tabId, offset } = message;

    if (!isLatestLocateRequest(tabId, requestId)) {
      return;
    }

    const cached = structureCache.get(tabId);
    const pathCalibratedRange = getPathCalibratedDirectLocateRange(tabId, cached, offset, getDirectValueTree);

    if (!isLatestLocateRequest(tabId, requestId)) {
      return;
    }

    if (pathCalibratedRange) {
      postLocateResultIfLatest({
        type: 'locate-result',
        requestId,
        tabId,
        found: true,
        startOffset: pathCalibratedRange.leftRange.startOffset,
        endOffset: pathCalibratedRange.leftRange.endOffset,
        rightStartOffset: pathCalibratedRange.rightRange.startOffset,
        rightEndOffset: pathCalibratedRange.rightRange.endOffset,
        path: pathCalibratedRange.path,
        pathText: formatJsonPath(pathCalibratedRange.path),
      });
      return;
    }

    const directRange = getDirectLocateRange(cached, offset);

    if (!isLatestLocateRequest(tabId, requestId)) {
      return;
    }

    if (directRange) {
      const rightRange = getDirectRightLocateRange(cached, offset);
      postLocateResultIfLatest({
        type: 'locate-result',
        requestId,
        tabId,
        found: true,
        startOffset: directRange.startOffset,
        endOffset: directRange.endOffset,
        rightStartOffset: rightRange.startOffset,
        rightEndOffset: rightRange.endOffset,
      });
      return;
    }

    try {
      if (!ensureStructureTrees(tabId, cached)) {
        postLocateResultIfLatest({
          type: 'locate-result',
          requestId,
          tabId,
          found: false,
        });
        return;
      }
    } catch {
      structureCache.delete(tabId);
      postLocateResultIfLatest({
        type: 'locate-result',
        requestId,
        tabId,
        found: false,
      });
      return;
    }

    if (!isLatestLocateRequest(tabId, requestId)) {
      return;
    }

    const resolvedNodes = getResolvedNodes(cached, offset);

    if (!resolvedNodes) {
      postLocateResultIfLatest({
        type: 'locate-result',
        requestId,
        tabId,
        found: false,
      });
      return;
    }

    postLocateResultIfLatest({
      type: 'locate-result',
      requestId,
      tabId,
      found: true,
      startOffset: resolvedNodes.leftNode.offset,
      endOffset: resolvedNodes.leftNode.offset + resolvedNodes.leftNode.length,
      rightStartOffset: resolvedNodes.rightNode.offset,
      rightEndOffset: resolvedNodes.rightNode.offset + resolvedNodes.rightNode.length,
      path: resolvedNodes.path,
      pathText: formatJsonPath(resolvedNodes.path),
    });
  }

  function handleLocateMessage(message) {
    latestLocateRequestByTab.set(message.tabId, message.requestId);
    setTimeout(() => {
      runLocateRequest(message);
    }, LOCATE_REQUEST_DEBOUNCE_MS);
  }

  function handleLocateRightDirectMessage(message) {
    latestLocateRequestByTab.set(message.tabId, message.requestId);
    setTimeout(() => {
      const { requestId, tabId, offset } = message;

      if (!isLatestLocateRequest(tabId, requestId)) {
        return;
      }

      const cachedViewer = viewerCache.get(tabId);
      const result = getRightOnlyLocateResult(tabId, requestId, offset, cachedViewer, getDirectValueTree);
      postLocateResultIfLatest({
        ...result,
        pathText: result.path ? formatJsonPath(result.path) : undefined,
      });
    }, LOCATE_REQUEST_DEBOUNCE_MS);
  }

  return {
    handleLocateMessage,
    handleLocateRightDirectMessage,
    isLatestLocateRequest,
  };
}
