import { parseJsonForFormatting } from '../utils/jsonFormat';
import { escapeJsonText, unescapeJsonText } from '../utils/jsonEscape';
import {
  saveJsonPreservingOriginalFormat,
} from '../utils/preserveJsonFormat';

function formatJsonForEdit(tabId, text, editJsonCache) {
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

function saveJsonForEdit(tabId, text, originalText, editJsonCache) {
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

  return formatJsonForEdit(tabId, text, editJsonCache);
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

export function createJsonWorkerEditJsonOperations({
  editJsonCache,
  jsonNodeEditOperations,
}) {
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
          return jsonNodeEditOperations.readJsonNodeForEdit(tabId, text, offset);
        }

        if (operation === 'save-node') {
          const result = jsonNodeEditOperations.saveJsonNodeForEdit(tabId, text, originalText, path);

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

        if (operation === 'delete-node') {
          return jsonNodeEditOperations.deleteJsonNodeForEdit(tabId, originalText, path);
        }

        if (operation === 'rename-node-key') {
          return jsonNodeEditOperations.renameJsonNodeKeyForEdit(tabId, text, originalText, path);
        }

        if (operation === 'save') {
          return saveJsonForEdit(tabId, text, originalText, editJsonCache);
        }

        return formatJsonForEdit(tabId, text, editJsonCache);
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

  return {
    handleEditJsonMessage,
  };
}
