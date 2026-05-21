import { findNodeAtLocation, getLocation } from 'jsonc-parser';
import { getIdentityLocateRange, getLightweightTokenLocateRange } from '../utils/lightweightLocate';
import { getJsonPathLocateRange } from '../utils/jsonPathLocate';
import { formatJsonPath } from '../utils/jsonPath';

const LOCATE_REQUEST_DEBOUNCE_MS = 16;

export function getLocateCandidateOffsets(text, offset) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const lineStart = text.lastIndexOf('\n', Math.max(0, safeOffset - 1)) + 1;
  const nextLineBreak = text.indexOf('\n', safeOffset);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
  const candidates = [safeOffset, Math.max(0, safeOffset - 1), Math.min(text.length, safeOffset + 1)];

  let firstNonWhitespace = lineStart;
  while (firstNonWhitespace < lineEnd && /\s/.test(text[firstNonWhitespace])) {
    firstNonWhitespace += 1;
  }

  if (firstNonWhitespace < lineEnd) {
    candidates.push(firstNonWhitespace);
  }

  let nextNonWhitespace = safeOffset;
  while (nextNonWhitespace < lineEnd && /\s/.test(text[nextNonWhitespace])) {
    nextNonWhitespace += 1;
  }

  if (nextNonWhitespace < lineEnd) {
    candidates.push(nextNonWhitespace);
  }

  let previousNonWhitespace = Math.min(safeOffset - 1, lineEnd - 1);
  while (previousNonWhitespace >= lineStart && /\s/.test(text[previousNonWhitespace])) {
    previousNonWhitespace -= 1;
  }

  if (previousNonWhitespace >= lineStart) {
    candidates.push(previousNonWhitespace);
  }

  return candidates.filter(
    (candidate, index, values) => candidate >= 0 && candidate <= text.length && values.indexOf(candidate) === index
  );
}

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

function getDirectLocateRange(cached, offset) {
  if (!cached || !cached.directLocate || !cached.viewerData || !(cached.viewerData.lineStarts instanceof Uint32Array)) {
    return null;
  }

  if (
    cached.directLocateMode === 'token-search' &&
    typeof cached.rawText === 'string' &&
    typeof cached.formattedText === 'string'
  ) {
    return getLightweightTokenLocateRange(
      cached.rawText,
      cached.formattedText,
      cached.viewerData,
      offset,
      cached.tokenLocateCache
    );
  }

  return getIdentityLocateRange(
    typeof cached.formattedText === 'string' ? cached.formattedText.length : offset + 1,
    cached.viewerData,
    offset
  );
}

function getDirectRightLocateRange(cached, offset) {
  if (
    !cached ||
    typeof cached.formattedText !== 'string' ||
    !cached.viewerData ||
    !(cached.viewerData.lineStarts instanceof Uint32Array)
  ) {
    const safeOffset = Math.max(0, Math.floor(offset));
    return {
      startOffset: safeOffset,
      endOffset: safeOffset + 1,
    };
  }

  return getIdentityLocateRange(cached.formattedText.length, cached.viewerData, offset);
}

function getPathCalibratedDirectLocateRange(tabId, cached, offset, getDirectValueTree) {
  if (
    !cached ||
    !cached.directLocate ||
    typeof cached.rawText !== 'string' ||
    typeof cached.formattedText !== 'string'
  ) {
    return null;
  }

  const formattedTree = getDirectValueTree(tabId, cached.requestId, cached.formattedText);
  if (!formattedTree) {
    return null;
  }

  const candidateOffsets = getLocateCandidateOffsets(cached.formattedText, offset);
  for (const candidateOffset of candidateOffsets) {
    const location = getLocation(cached.formattedText, candidateOffset);
    const rightNode = findNodeAtLocation(formattedTree, location.path);

    if (!rightNode) {
      continue;
    }

    const leftRange = getJsonPathLocateRange(cached.rawText, location.path);
    if (leftRange) {
      return {
        leftRange,
        rightRange: {
          startOffset: rightNode.offset,
          endOffset: rightNode.offset + rightNode.length,
        },
        path: location.path,
      };
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
      const sourceText = cachedViewer?.formattedText;
      const sourceRequestId = cachedViewer?.requestId ?? requestId;

      if (typeof sourceText !== 'string' || !sourceText) {
        postLocateResultIfLatest({
          type: 'locate-result',
          requestId,
          tabId,
          found: false,
          rightOnly: true,
        });
        return;
      }

      try {
        const formattedTree = getDirectValueTree(tabId, sourceRequestId, sourceText);

        if (!formattedTree) {
          postLocateResultIfLatest({
            type: 'locate-result',
            requestId,
            tabId,
            found: false,
            rightOnly: true,
          });
          return;
        }

        const candidateOffsets = getLocateCandidateOffsets(sourceText, offset);
        for (const candidateOffset of candidateOffsets) {
          const location = getLocation(sourceText, candidateOffset);
          const rightNode = findNodeAtLocation(formattedTree, location.path);

          if (rightNode) {
            postLocateResultIfLatest({
              type: 'locate-result',
              requestId,
              tabId,
              found: true,
              rightOnly: true,
              rightStartOffset: rightNode.offset,
              rightEndOffset: rightNode.offset + rightNode.length,
              path: location.path,
              pathText: formatJsonPath(location.path),
            });
            return;
          }
        }

        postLocateResultIfLatest({
          type: 'locate-result',
          requestId,
          tabId,
          found: false,
          rightOnly: true,
        });
      } catch {
        postLocateResultIfLatest({
          type: 'locate-result',
          requestId,
          tabId,
          found: false,
          rightOnly: true,
        });
      }
    }, LOCATE_REQUEST_DEBOUNCE_MS);
  }

  return {
    handleLocateMessage,
    handleLocateRightDirectMessage,
    isLatestLocateRequest,
  };
}
