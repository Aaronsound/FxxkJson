/* eslint-disable no-restricted-globals */
import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';
import {
  buildLargeViewerData,
  findSearchMatchesBatchInLargeJson,
} from '../utils/largeJsonViewerData';
import { formatJsonText, parseJsonForFormatting } from '../utils/jsonFormat';
import { DEFAULT_SEARCH_OPTIONS, SEARCH_BATCH_SIZE } from '../types/jsonTool';
import { buildLineStarts, findTextSearchBatch } from '../utils/searchText';
import {
  getIdentityLocateRange,
  getLightweightTokenLocateRange,
} from '../utils/lightweightLocate';
import { saveJsonPreservingOriginalFormat } from '../utils/preserveJsonFormat';

const structureCache = new Map();
const viewerCache = new Map();
const directValueTreeCache = new Map();
const directValueWarmupTimers = new Map();
const editJsonCache = new Map();
const rawSearchCache = new Map();
const latestFormatRequestByTab = new Map();
const DIRECT_VALUE_TREE_PREWARM_MAX_LENGTH = 5 * 1024 * 1024;

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

function copyJsonAsStringLiteral(text) {
  return JSON.stringify(JSON.stringify(JSON.parse(text)));
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
      return { rightNode, leftNode };
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
      offset
    );
  }

  return getIdentityLocateRange(
    typeof cached.formattedText === 'string' ? cached.formattedText.length : offset + 1,
    cached.viewerData,
    offset
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

self.onmessage = (event) => {
  const message = event.data;

  if (message.type === 'clear-structure') {
    clearDirectValueWarmup(message.tabId);
    structureCache.delete(message.tabId);
    viewerCache.delete(message.tabId);
    directValueTreeCache.delete(message.tabId);
    editJsonCache.delete(message.tabId);
    rawSearchCache.delete(message.tabId);
    latestFormatRequestByTab.delete(message.tabId);
    return;
  }

  if (message.type === 'edit-json') {
    const { requestId, tabId, operation, text, originalText } = message;

    try {
      const data = (() => {
        if (operation === 'copy-literal') {
          return copyJsonAsStringLiteral(text);
        }

        if (operation === 'save') {
          return saveJsonForEdit(tabId, text, originalText);
        }

        return formatJsonForEdit(tabId, text);
      })();

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

    return;
  }

  if (message.type === 'format') {
    const {
      requestId,
      tabId,
      text,
      enableStructure,
      enableDirectLocate,
      deferStructure = false,
      buildViewer,
    } = message;
    latestFormatRequestByTab.set(tabId, requestId);
    clearDirectValueWarmup(tabId);
    const cachedEditJson = editJsonCache.get(tabId);
    if (cachedEditJson?.originalText !== text) {
      editJsonCache.delete(tabId);
    }
    viewerCache.delete(tabId);
    directValueTreeCache.delete(tabId);
    try {
      const { formatted, normalizedNestedString } = formatJsonText(text);
      postMessage({
        type: 'format-result',
        requestId,
        tabId,
        success: true,
        data: formatted,
      });

      if (buildViewer) {
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
                directLocateMode: text === formatted ? 'identity' : 'token-search',
                rawText: text === formatted ? undefined : text,
                formattedText: formatted,
                viewerData,
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
      }
      else {
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
        rawText: text,
        formattedText: formatted,
        rawTree: undefined,
        formattedTree: undefined,
      });

      if (deferStructure) {
        postMessage({
          type: 'structure-ready',
          requestId,
          tabId,
          ready: true,
        });
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
    } catch (err) {
      structureCache.delete(tabId);
      viewerCache.delete(tabId);
      directValueTreeCache.delete(tabId);
      postMessage({
        type: 'format-result',
        requestId,
        tabId,
        success: false,
        error: err instanceof Error ? err.message : 'JSON 解析失败',
      });
    }

    return;
  }

  if (message.type === 'locate') {
    const { requestId, tabId, offset } = message;
    const cached = structureCache.get(tabId);
    const directRange = getDirectLocateRange(cached, offset);

    if (directRange) {
      postMessage({
        type: 'locate-result',
        requestId,
        tabId,
        found: true,
        startOffset: directRange.startOffset,
        endOffset: directRange.endOffset,
      });
      return;
    }

    try {
      if (!ensureStructureTrees(tabId, cached)) {
        postMessage({
          type: 'locate-result',
          requestId,
          tabId,
          found: false,
        });
        return;
      }
    } catch {
      structureCache.delete(tabId);
      postMessage({
        type: 'locate-result',
        requestId,
        tabId,
        found: false,
      });
      return;
    }

    const resolvedNodes = getResolvedNodes(cached, offset);

    if (!resolvedNodes) {
      postMessage({
        type: 'locate-result',
        requestId,
        tabId,
        found: false,
      });
      return;
    }

    postMessage({
      type: 'locate-result',
      requestId,
      tabId,
      found: true,
      startOffset: resolvedNodes.leftNode.offset,
      endOffset: resolvedNodes.leftNode.offset + resolvedNodes.leftNode.length,
    });

    return;
  }

  if (message.type === 'read-value') {
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

  if (message.type === 'read-value-direct') {
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

    return;
  }

  if (message.type === 'search') {
    const {
      requestId,
      tabId,
      target = 'right',
      query,
      searchOptions,
      startOffset = 0,
      append = false,
    } = message;

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
        postMessage({
          type: 'search-result',
          requestId,
          tabId,
          target,
          query,
          matches: [],
          hasMore: false,
          nextStartOffset: 0,
          append,
        });
        return;
      }

      try {
        if (!(cachedRaw.lineStarts instanceof Uint32Array)) {
          cachedRaw.lineStarts = buildLineStarts(cachedRaw.rawText);
          rawSearchCache.set(tabId, cachedRaw);
        }

        const result = findTextSearchBatch(
          cachedRaw.rawText,
          cachedRaw.lineStarts,
          cachedRaw.lineStarts.length,
          typeof query === 'string' ? query : '',
          searchOptions ?? DEFAULT_SEARCH_OPTIONS,
          startOffset,
          SEARCH_BATCH_SIZE
        );

        postMessage({
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
        postMessage({
          type: 'search-result',
          requestId,
          tabId,
          target,
          query,
          matches: [],
          hasMore: false,
          nextStartOffset: 0,
          append,
        });
      }
      return;
    }

    const cachedViewer = viewerCache.get(tabId);

    if (
      !cachedViewer
      || typeof cachedViewer.formattedText !== 'string'
      || !cachedViewer.viewerData
    ) {
      postMessage({
        type: 'search-result',
        requestId,
        tabId,
        target,
        query,
        matches: [],
        hasMore: false,
        nextStartOffset: 0,
        append,
      });
      return;
    }

    try {
      const result = findSearchMatchesBatchInLargeJson(
        cachedViewer.formattedText,
        cachedViewer.viewerData.lineStarts,
        cachedViewer.viewerData.lineCount,
        typeof query === 'string' ? query : '',
        searchOptions ?? DEFAULT_SEARCH_OPTIONS,
        startOffset,
        SEARCH_BATCH_SIZE
      );

      postMessage({
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
      postMessage({
        type: 'search-result',
        requestId,
        tabId,
        target,
        query,
        matches: [],
        hasMore: false,
        nextStartOffset: 0,
        append,
      });
    }
  }
};
