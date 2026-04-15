/* eslint-disable no-restricted-globals */
import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';

const structureCache = new Map();

self.onmessage = (event) => {
  const message = event.data;

  if (message.type === 'clear-structure') {
    structureCache.delete(message.tabId);
    return;
  }

  if (message.type === 'format') {
    const { requestId, tabId, text, enableStructure } = message;

    try {
      const formatted = JSON.stringify(JSON.parse(text), null, 2);
      postMessage({
        type: 'format-result',
        requestId,
        tabId,
        success: true,
        data: formatted,
      });

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

    if (!cached || !cached.rawTree || !cached.formattedTree) {
      postMessage({
        type: 'locate-result',
        requestId,
        tabId,
        found: false,
      });
      return;
    }

    const location = getLocation(cached.formattedText, offset);
    const rightNode = findNodeAtLocation(cached.formattedTree, location.path);
    const leftNode = findNodeAtLocation(cached.rawTree, location.path);

    if (!rightNode || !leftNode) {
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
      startOffset: leftNode.offset,
      endOffset: leftNode.offset + leftNode.length,
    });
  }
};
