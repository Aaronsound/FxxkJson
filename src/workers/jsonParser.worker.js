/* eslint-disable no-restricted-globals */
/** @typedef {import('../types/jsonTool').WorkerRequestMessage} WorkerRequestMessage */
import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';
import {
  buildLargeViewerData,
} from '../utils/largeJsonViewerData';
import { buildLargeRawViewerData } from '../utils/largeRawViewerData';
import { formatJsonText, parseJsonForFormatting, repairJsonText } from '../utils/jsonFormat';
import { escapeJsonText, unescapeJsonText } from '../utils/jsonEscape';
import { DEFAULT_SEARCH_OPTIONS, LARGE_FILE_THRESHOLD, SEARCH_BATCH_SIZE } from '../types/jsonTool';
import { buildLineStarts, findTextSearchBatchAsync } from '../utils/searchText';
import { getDeferredStructureWarmupDelayMs } from '../utils/jsonWorkerPlan';
import { shouldUseDedicatedRightViewer } from '../utils/jsonDocumentMetrics';
import {
  getIdentityLocateRange,
  getLightweightTokenLocateRange,
} from '../utils/lightweightLocate';
import { getJsonPathLocateRange } from '../utils/jsonPathLocate';
import {
  saveJsonNodePreservingOriginalFormat,
  saveJsonPreservingOriginalFormat,
} from '../utils/preserveJsonFormat';
import { formatJsonPath } from '../utils/jsonPath';
import {
  createNodeEditCacheEntry,
  getCachedNodeRange,
} from './jsonNodeEditCache';
import { getJsonWorkerMessageHandler } from '../utils/jsonWorkerMessageRouting';

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
const LOCATE_REQUEST_DEBOUNCE_MS = 16;
let textDecoder = null;
let textEncoder = null;

function getTextDecoder() {
  if (!textDecoder) {
    textDecoder = new TextDecoder();
  }

  return textDecoder;
}

function getTextEncoder() {
  if (!textEncoder) {
    textEncoder = new TextEncoder();
  }

  return textEncoder;
}

function getTextByteLength(text) {
  return getTextEncoder().encode(text).length;
}

function getStructureWarmupDelayForTexts(rawText, formattedText, baseDelayMs) {
  return getDeferredStructureWarmupDelayMs(
    Math.max(getTextByteLength(rawText ?? ''), getTextByteLength(formattedText ?? '')),
    baseDelayMs
  );
}

function readMessageText(message) {
  if (typeof message.text === 'string') {
    return message.text;
  }

  if (message.textBuffer instanceof ArrayBuffer) {
    return getTextDecoder().decode(new Uint8Array(message.textBuffer));
  }

  return '';
}

function appendTextPayload(message, transfer, stringKey, bufferKey, text) {
  if (typeof text === 'string' && text.length >= LARGE_FILE_THRESHOLD) {
    const bytes = getTextEncoder().encode(text);
    const buffer = bytes.buffer;
    message[bufferKey] = buffer;
    transfer.push(buffer);
    return;
  }

  message[stringKey] = text;
}

function postTextResult(payload, text) {
  const message = { ...payload };
  const transfer = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', text);
  postMessage(message, transfer);
}

function postRepairResult(payload, formattedText, repairedText) {
  const message = { ...payload };
  const transfer = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', formattedText);
  appendTextPayload(message, transfer, 'repairedText', 'repairedTextBuffer', repairedText);
  postMessage(message, transfer);
}

function formatJsonForEdit(tabId, text) {
  const { value, normalizedNestedString } = parseJsonForFormatting(text);

  if (normalizedNestedString) {
    editJsonCache.delete(tabId);
  } else {
    editJsonCache.set(tabId, {
      originalText: text,
      originalValue: value,
    });
  }

  return JSON.stringify(value, null, 2);
}

function saveJsonForEdit(tabId, text, originalText) {
  if (typeof originalText === 'string') {
    const cached = editJsonCache.get(tabId);
    const saved = saveJsonPreservingOriginalFormat(
      originalText,
      text,
      cached?.originalText === originalText
        ? { originalValue: cached.originalValue }
        : undefined
    );

    editJsonCache.delete(tabId);
    return saved;
  }

  return formatJsonForEdit(tabId, text);
}

function getCachedFormattedText(tabId) {
  const cachedStructure = structureCache.get(tabId);
  if (typeof cachedStructure?.formattedText === 'string') {
    return cachedStructure.formattedText;
  }

  const cachedViewer = viewerCache.get(tabId);
  if (typeof cachedViewer?.formattedText === 'string') {
    return cachedViewer.formattedText;
  }

  return null;
}

function readJsonNodeForEdit(tabId, text, offset) {
  const sourceText = typeof text === 'string' && text.trim()
    ? text
    : getCachedFormattedText(tabId);
  if (
    typeof sourceText !== 'string'
    || !sourceText.trim()
    || typeof offset !== 'number'
    || !Number.isFinite(offset)
  ) {
    throw new Error('当前节点无法编辑');
  }

  const cachedStructure = structureCache.get(tabId);
  const tree = cachedStructure?.formattedText === sourceText && cachedStructure.formattedTree
    ? cachedStructure.formattedTree
    : parseTree(sourceText);

  if (!tree) {
    throw new Error('当前节点无法编辑');
  }

  const candidateOffsets = getLocateCandidateOffsets(sourceText, offset);
  for (const candidateOffset of candidateOffsets) {
    const location = getLocation(sourceText, candidateOffset);
    const node = findNodeAtLocation(tree, location.path);

    if (node) {
      if (cachedStructure?.formattedText === sourceText && !cachedStructure.formattedTree) {
        cachedStructure.formattedTree = tree;
        structureCache.set(tabId, cachedStructure);
      }

      const rawNode = cachedStructure?.formattedText === sourceText && cachedStructure.rawTree
        ? findNodeAtLocation(cachedStructure.rawTree, location.path)
        : null;
      const rawTextLength = typeof cachedStructure?.rawText === 'string'
        ? cachedStructure.rawText.length
        : cachedStructure?.rawTree?.length;

      nodeEditCache.set(tabId, createNodeEditCacheEntry({
        formattedText: sourceText,
        path: [...location.path],
        formattedNode: node,
        rawNode,
        rawTextLength,
      }));

      return JSON.stringify({
        path: location.path,
        value: sourceText.slice(node.offset, node.offset + node.length),
      });
    }
  }

  throw new Error('当前节点无法编辑');
}

function patchCachedFormattedNode(tabId, text, path, rawText) {
  const formattedText = getCachedFormattedText(tabId) ?? nodeEditCache.get(tabId)?.formattedText;

  if (typeof formattedText !== 'string') {
    return {
      formattedText: null,
      structureWarming: false,
      viewerData: null,
      viewerIndexMs: null,
    };
  }

  const nextFormattedText = saveJsonNodePreservingOriginalFormat(
    formattedText,
    path,
    text,
    { range: getCachedNodeRange(nodeEditCache, tabId, path, 'formatted', formattedText) }
  );
  const viewerIndexStartedAt = performance.now();
  const viewerData = buildLargeViewerData(nextFormattedText);
  const viewerIndexMs = performance.now() - viewerIndexStartedAt;
  const requestId = latestFormatRequestByTab.get(tabId) ?? 0;
  let structureWarming = false;

  if (viewerData) {
    viewerCache.set(tabId, {
      requestId,
      formattedText: nextFormattedText,
      viewerData,
    });
  } else {
    viewerCache.delete(tabId);
  }

  directValueTreeCache.delete(tabId);
  clearDirectValueWarmup(tabId);
  clearDeferredStructureWarmup(tabId);

  const cachedStructure = structureCache.get(tabId);
  if (cachedStructure) {
    if (cachedStructure.directLocate) {
      if (viewerData) {
        structureCache.set(tabId, {
          requestId,
          directLocate: true,
          directLocateMode: rawText === nextFormattedText ? 'identity' : 'token-search',
          rawText: rawText === nextFormattedText ? undefined : rawText,
          formattedText: nextFormattedText,
          viewerData,
          tokenLocateCache: { tokenOffsetsByToken: new Map() },
        });
      } else {
        structureCache.delete(tabId);
      }
    } else {
      structureCache.set(tabId, {
        requestId,
        rawText,
        formattedText: nextFormattedText,
        rawTree: undefined,
        formattedTree: undefined,
      });
      scheduleDeferredStructureWarmup(
        tabId,
        requestId,
        getStructureWarmupDelayForTexts(rawText, nextFormattedText, 150)
      );
      structureWarming = true;
    }
  }

  return {
    formattedText: nextFormattedText,
    structureWarming,
    viewerData,
    viewerIndexMs,
  };
}

function saveJsonNodeForEdit(tabId, text, originalText, path) {
  if (typeof originalText !== 'string' || !Array.isArray(path)) {
    throw new Error('当前节点无法保存');
  }

  const rawText = saveJsonNodePreservingOriginalFormat(
    originalText,
    path,
    text,
    { range: getCachedNodeRange(nodeEditCache, tabId, path, 'raw', originalText) }
  );
  const rawViewerData = rawText.length >= LARGE_FILE_THRESHOLD
    ? buildLargeRawViewerData(rawText)
    : null;
  const formattedPatch = patchCachedFormattedNode(tabId, text, path, rawText);

  nodeEditCache.delete(tabId);

  return {
    rawText,
    rawViewerData,
    ...formattedPatch,
  };
}

function copyJsonAsStringLiteral(text) {
  return JSON.stringify(JSON.stringify(JSON.parse(text)));
}

function transformJsonEscape(operation, text) {
  const result = operation === 'escape-json'
    ? escapeJsonText(text)
    : unescapeJsonText(text);
  return result.text;
}

function getResolvedNodes(cached, offset) {
  if (
    !cached
    || typeof cached.formattedText !== 'string'
    || !cached.rawTree
    || !cached.formattedTree
  ) {
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

function getLocateCandidateOffsets(text, offset) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const lineStart = text.lastIndexOf('\n', Math.max(0, safeOffset - 1)) + 1;
  const nextLineBreak = text.indexOf('\n', safeOffset);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
  const candidates = [
    safeOffset,
    Math.max(0, safeOffset - 1),
    Math.min(text.length, safeOffset + 1),
  ];

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

  return candidates.filter((candidate, index, values) => (
    candidate >= 0
    && candidate <= text.length
    && values.indexOf(candidate) === index
  ));
}

function getDirectLocateRange(cached, offset) {
  if (
    !cached
    || !cached.directLocate
    || !cached.viewerData
    || !(cached.viewerData.lineStarts instanceof Uint32Array)
  ) {
    return null;
  }

  if (
    cached.directLocateMode === 'token-search'
    && typeof cached.rawText === 'string'
    && typeof cached.formattedText === 'string'
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
    !cached
    || typeof cached.formattedText !== 'string'
    || !cached.viewerData
    || !(cached.viewerData.lineStarts instanceof Uint32Array)
  ) {
    const safeOffset = Math.max(0, Math.floor(offset));
    return {
      startOffset: safeOffset,
      endOffset: safeOffset + 1,
    };
  }

  return getIdentityLocateRange(
    cached.formattedText.length,
    cached.viewerData,
    offset
  );
}

function getPathCalibratedDirectLocateRange(tabId, cached, offset) {
  if (
    !cached
    || !cached.directLocate
    || typeof cached.rawText !== 'string'
    || typeof cached.formattedText !== 'string'
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

function getSearchRequestKey(tabId, target) {
  return `${target}:${tabId}`;
}

function isLatestSearchRequest(tabId, target, requestId) {
  return latestSearchRequestByKey.get(getSearchRequestKey(tabId, target)) === requestId;
}

function postSearchResultIfLatest(payload) {
  if (!isLatestSearchRequest(payload.tabId, payload.target, payload.requestId)) {
    return;
  }

  postMessage(payload);
}

function isLatestLocateRequest(tabId, requestId) {
  return latestLocateRequestByTab.get(tabId) === requestId;
}

function postLocateResultIfLatest(payload) {
  if (!isLatestLocateRequest(payload.tabId, payload.requestId)) {
    return;
  }

  postMessage(payload);
}

function cancelInteractiveRequests(tabId) {
  latestLocateRequestByTab.delete(tabId);
  latestSearchRequestByKey.delete(getSearchRequestKey(tabId, 'left'));
  latestSearchRequestByKey.delete(getSearchRequestKey(tabId, 'right'));
}

function postEmptySearchResult(message) {
  postSearchResultIfLatest({
    type: 'search-result',
    requestId: message.requestId,
    tabId: message.tabId,
    target: message.target ?? 'right',
    query: message.query,
    matches: [],
    hasMore: false,
    nextStartOffset: 0,
    append: Boolean(message.append),
  });
}

async function runSearchRequest(message) {
  const {
    requestId,
    tabId,
    target = 'right',
    query,
    searchOptions,
    startOffset = 0,
    append = false,
  } = message;
  const shouldCancel = () => !isLatestSearchRequest(tabId, target, requestId);

  if (shouldCancel()) {
    return;
  }

  if (target === 'left') {
    if (typeof message.text === 'string') {
      rawSearchCache.set(tabId, {
        rawText: message.text,
        rawRevision: message.rawRevision ?? null,
        lineStarts: null,
      });
    }

    const cachedRaw = rawSearchCache.get(tabId);
    if (
      !cachedRaw
      || typeof cachedRaw.rawText !== 'string'
      || (
        typeof message.rawRevision === 'number'
        && cachedRaw.rawRevision !== message.rawRevision
      )
    ) {
      postEmptySearchResult(message);
      return;
    }

    try {
      if (!(cachedRaw.lineStarts instanceof Uint32Array)) {
        cachedRaw.lineStarts = buildLineStarts(cachedRaw.rawText);
        rawSearchCache.set(tabId, cachedRaw);
      }

      if (shouldCancel()) {
        return;
      }

      const result = await findTextSearchBatchAsync(
        cachedRaw.rawText,
        cachedRaw.lineStarts,
        cachedRaw.lineStarts.length,
        typeof query === 'string' ? query : '',
        searchOptions ?? DEFAULT_SEARCH_OPTIONS,
        startOffset,
        SEARCH_BATCH_SIZE,
        shouldCancel
      );

      if (result.cancelled || shouldCancel()) {
        return;
      }

      postSearchResultIfLatest({
        type: 'search-result',
        requestId,
        tabId,
        target,
        query,
        matches: result.matches,
        hasMore: result.hasMore,
        nextStartOffset: result.nextStartOffset,
        append,
      });
    } catch {
      postEmptySearchResult(message);
    }
    return;
  }

  const cachedViewer = viewerCache.get(tabId);

  if (
    !cachedViewer
    || typeof cachedViewer.formattedText !== 'string'
    || !cachedViewer.viewerData
  ) {
    postEmptySearchResult(message);
    return;
  }

  try {
    const result = await findTextSearchBatchAsync(
      cachedViewer.formattedText,
      cachedViewer.viewerData.lineStarts,
      cachedViewer.viewerData.lineCount,
      typeof query === 'string' ? query : '',
      searchOptions ?? DEFAULT_SEARCH_OPTIONS,
      startOffset,
      SEARCH_BATCH_SIZE,
      shouldCancel
    );

    if (result.cancelled || shouldCancel()) {
      return;
    }

    postSearchResultIfLatest({
      type: 'search-result',
      requestId,
      tabId,
      target,
      query,
      matches: result.matches,
      hasMore: result.hasMore,
      nextStartOffset: result.nextStartOffset,
      append,
    });
  } catch {
    postEmptySearchResult(message);
  }
}

function runLocateRequest(message) {
  const { requestId, tabId, offset } = message;

  if (!isLatestLocateRequest(tabId, requestId)) {
    return;
  }

  const cached = structureCache.get(tabId);
  const pathCalibratedRange = getPathCalibratedDirectLocateRange(tabId, cached, offset);

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

function handleEditJsonMessage(message) {
  const { requestId, tabId, operation, text, originalText, path, offset } = message;

  try {
    const data = (() => {
      if (operation === 'copy-literal') {
        return copyJsonAsStringLiteral(text);
      }

      if (operation === 'escape-json' || operation === 'unescape-json') {
        return transformJsonEscape(operation, text);
      }

      if (operation === 'read-node') {
        return readJsonNodeForEdit(tabId, text, offset);
      }

      if (operation === 'save-node') {
        const result = saveJsonNodeForEdit(tabId, text, originalText, path);

        postMessage({
          type: 'edit-json-result',
          requestId,
          tabId,
          operation,
          success: true,
          data: result.rawText,
          formattedText: result.formattedText,
          structureWarming: result.structureWarming,
          rawViewerData: result.rawViewerData,
          viewerData: result.viewerData,
          viewerIndexMs: result.viewerIndexMs,
        });
        return null;
      }

      if (operation === 'save') {
        return saveJsonForEdit(tabId, text, originalText);
      }

      return formatJsonForEdit(tabId, text);
    })();

    if (data === null) {
      return;
    }

    postMessage({
      type: 'edit-json-result',
      requestId,
      tabId,
      operation,
      success: true,
      data,
    });
  } catch (err) {
    postMessage({
      type: 'edit-json-result',
      requestId,
      tabId,
      operation,
      success: false,
      error: err instanceof Error ? err.message : 'JSON 处理失败',
    });
  }
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

function handleSearchMessage(message) {
  const target = message.target ?? 'right';
  latestSearchRequestByKey.set(getSearchRequestKey(message.tabId, target), message.requestId);
  setTimeout(() => {
    if (isLatestSearchRequest(message.tabId, target, message.requestId)) {
      void runSearchRequest({
        ...message,
        target,
      });
    }
  }, 0);
}

const workerMessageHandlers = {
  'clear-structure': handleClearStructureMessage,
  'edit-json': handleEditJsonMessage,
  format: handleFormatMessage,
  locate: handleLocateMessage,
  'locate-right-direct': handleLocateRightDirectMessage,
  repair: handleRepairMessage,
  'read-value': handleReadValueMessage,
  'read-value-direct': handleReadValueDirectMessage,
  search: handleSearchMessage,
};

self.onmessage = (event) => {
  /** @type {WorkerRequestMessage} */
  const message = event.data;
  const handler = getJsonWorkerMessageHandler(workerMessageHandlers, message);
  handler?.(message);
};
