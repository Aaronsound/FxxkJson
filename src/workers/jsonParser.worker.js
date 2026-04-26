/* eslint-disable no-restricted-globals */
import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';

const structureCache = new Map();
const viewerCache = new Map();
const directValueTreeCache = new Map();
const DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD = 0;

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

function buildLargeViewerData(text) {
  const lineStarts = [0];
  const regions = [];
  const stack = [];
  let line = 1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '\n') {
      line += 1;
      lineStarts.push(index + 1);
      continue;
    }

    if (char === '{') {
      stack.push({ close: '}', startLine: line, kind: 'object' });
      continue;
    }

    if (char === '[') {
      stack.push({ close: ']', startLine: line, kind: 'array' });
      continue;
    }

    if (char === '}' || char === ']') {
      const current = stack.pop();
      if (!current || current.close !== char) {
        continue;
      }

      if (current.startLine < line) {
        regions.push({
          startLine: current.startLine,
          endLine: line,
          kind: current.kind,
        });
      }
    }
  }

  if (lineStarts.length <= DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD) {
    return null;
  }

  regions.sort((left, right) => {
    if (left.startLine !== right.startLine) {
      return left.startLine - right.startLine;
    }

    return right.endLine - left.endLine;
  });

  return {
    lineStarts: Uint32Array.from(lineStarts),
    regions,
    lineCount: lineStarts.length,
  };
}

function binarySearchLineStarts(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = lineStarts[mid];

    if (value <= offset) {
      result = mid;
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  return result;
}

function findSearchMatchesInLargeJson(text, lineStarts, lineCount, searchTerm) {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  if (!normalizedTerm) {
    return [];
  }

  const normalizedText = text.toLowerCase();
  const matches = [];
  let fromIndex = 0;

  while (fromIndex < normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedTerm, fromIndex);
    if (matchIndex === -1) {
      break;
    }

    const lineIndex = binarySearchLineStarts(lineStarts, matchIndex);
    const lineNumber = lineIndex + 1;
    const lineStartOffset = lineStarts[lineIndex] ?? 0;
    const lineEndOffset = lineNumber < lineCount
      ? Math.max(lineStartOffset, (lineStarts[lineNumber] ?? text.length) - 1)
      : text.length;
    const localStart = matchIndex - lineStartOffset;
    const localEnd = Math.min(matchIndex + normalizedTerm.length, lineEndOffset) - lineStartOffset;

    matches.push({
      start: matchIndex,
      end: matchIndex + normalizedTerm.length,
      lineNumber,
      lineStartOffset,
      localStart,
      localEnd,
    });

    fromIndex = matchIndex + Math.max(normalizedTerm.length, 1);
  }

  return matches;
}

function getDirectValueTree(tabId, requestId, text) {
  const cachedTree = directValueTreeCache.get(tabId);
  if (
    cachedTree
    && cachedTree.requestId === requestId
    && cachedTree.text === text
  ) {
    return cachedTree.formattedTree;
  }

  const formattedTree = parseTree(text);
  directValueTreeCache.set(tabId, {
    requestId,
    text,
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
    return;
  }

  if (message.type === 'format') {
    const { requestId, tabId, text, enableStructure, buildViewer } = message;
    viewerCache.delete(tabId);
    directValueTreeCache.delete(tabId);

    try {
      const formatted = JSON.stringify(JSON.parse(text), null, 2);
      postMessage({
        type: 'format-result',
        requestId,
        tabId,
        success: true,
        data: formatted,
      });

      if (buildViewer) {
        setTimeout(() => {
          const viewerData = buildLargeViewerData(formatted);
          if (viewerData) {
            viewerCache.set(tabId, {
              requestId,
              formattedText: formatted,
              viewerData,
            });
          } else {
            viewerCache.delete(tabId);
          }
          postMessage({
            type: 'viewer-ready',
            requestId,
            tabId,
            viewerData,
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
        });
      }

      if (!enableStructure) {
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
    const { requestId, tabId, query } = message;
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
        query,
        matches: [],
      });
      return;
    }

    try {
      const matches = findSearchMatchesInLargeJson(
        cachedViewer.formattedText,
        cachedViewer.viewerData.lineStarts,
        cachedViewer.viewerData.lineCount,
        typeof query === 'string' ? query : ''
      );

      postMessage({
        type: 'search-result',
        requestId,
        tabId,
        query,
        matches,
      });
    } catch {
      postMessage({
        type: 'search-result',
        requestId,
        tabId,
        query,
        matches: [],
      });
    }
  }
};
