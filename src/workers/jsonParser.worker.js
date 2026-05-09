/* eslint-disable no-restricted-globals */
import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';
import {
  binarySearchLineStarts,
  buildLargeViewerData,
  findSearchMatchesBatchInLargeJson,
} from '../utils/largeJsonViewerData';
import { formatJsonText } from '../utils/jsonFormat';
import { DEFAULT_SEARCH_OPTIONS, SEARCH_BATCH_SIZE } from '../types/jsonTool';
import { buildLineStarts, findTextSearchBatch } from '../utils/searchText';

const structureCache = new Map();
const viewerCache = new Map();
const directValueTreeCache = new Map();
const rawSearchCache = new Map();
const latestFormatRequestByTab = new Map();

function formatJsonForEdit(text) {
  return JSON.stringify(JSON.parse(text), null, 2);
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

  const candidateOffsets = [
    offset,
    Math.max(0, offset - 1),
    Math.min(cached.formattedText.length, offset + 1),
  ].filter((candidate, index, values) => values.indexOf(candidate) === index);

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

function getDirectLocateRange(cached, offset) {
  if (
    !cached
    || !cached.directLocate
    || !cached.viewerData
    || !(cached.viewerData.lineStarts instanceof Uint32Array)
  ) {
    return null;
  }

  const lineStarts = cached.viewerData.lineStarts;
  const lineIndex = binarySearchLineStarts(lineStarts, offset);
  const lineStartOffset = lineStarts[lineIndex] ?? 0;
  const nextLineStart = lineStarts[lineIndex + 1];
  const lineEndOffset = typeof nextLineStart === 'number'
    ? Math.max(lineStartOffset + 1, nextLineStart - 1)
    : Math.max(lineStartOffset + 1, offset + 1);

  return {
    startOffset: lineStartOffset,
    endOffset: lineEndOffset,
  };
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

self.onmessage = (event) => {
  const message = event.data;

  if (message.type === 'clear-structure') {
    structureCache.delete(message.tabId);
    viewerCache.delete(message.tabId);
    directValueTreeCache.delete(message.tabId);
    rawSearchCache.delete(message.tabId);
    latestFormatRequestByTab.delete(message.tabId);
    return;
  }

  if (message.type === 'edit-json') {
    const { requestId, tabId, operation, text } = message;

    try {
      const data = operation === 'copy-literal'
        ? copyJsonAsStringLiteral(text)
        : formatJsonForEdit(text);

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
      buildViewer,
    } = message;
    latestFormatRequestByTab.set(tabId, requestId);
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

          if (!enableStructure && enableDirectLocate) {
            if (viewerData && text === formatted) {
              structureCache.set(tabId, {
                requestId,
                directLocate: true,
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

      setTimeout(() => {
        const current = structureCache.get(tabId);
        if (!current || current.requestId !== requestId) {
          return;
        }

        const rawTree = parseTree(current.rawText) ?? undefined;
        const formattedTree = parseTree(current.formattedText) ?? undefined;
        const latest = structureCache.get(tabId);
        if (!latest || latest.requestId !== requestId) {
          return;
        }

        // Raw text is only needed until the source tree is built.
        // Release it as soon as indexing finishes to reduce worker memory pressure.
        latest.rawText = undefined;
        latest.rawTree = rawTree;
        latest.formattedTree = formattedTree;
        structureCache.set(tabId, latest);

        postMessage({
          type: 'structure-ready',
          requestId,
          tabId,
          ready: Boolean(rawTree && formattedTree),
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
