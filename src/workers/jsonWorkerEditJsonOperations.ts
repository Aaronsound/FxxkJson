import type {
  EditJsonWorkerOperation,
  EditJsonWorkerRequest,
  JsonEditPath,
  LargeJsonLineIndex,
  WorkerMessage,
} from '../types/jsonTool';
import { DEFAULT_SEARCH_OPTIONS, LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import {
  measureJsonDocument,
  measureJsonDocumentWithKnownByteLength,
  shouldUseDedicatedRightViewerForMetrics,
} from '../utils/jsonDocumentMetrics';
import { escapeJsonStringLiteral, unescapeJsonStringLiteral } from '../utils/jsonEscape';
import { parseJsonForFormatting } from '../utils/jsonFormat';
import { findJsonParseError } from '../utils/findJsonParseError';
import { canInlineJsonTextPatch } from '../utils/jsonTextPatch';
import { buildLargeLiteralViewerData } from '../utils/largeJsonViewerData';
import { buildEscapedStringLiteralRawViewerData, buildLargeRawViewerData } from '../utils/largeRawViewerData';
import type { JsonValue } from '../utils/preserveJsonFormat';
import { saveJsonPreservingOriginalFormat } from '../utils/preserveJsonFormat';
import { replaceTextSearchMatches } from '../utils/searchText';
import type { RawDocumentCacheEntry, SaveNodeEditResult } from './jsonNodeEditOperations';
import { MissingOriginalJsonTextError } from './jsonNodeEditOperations';
import {
  postNodePatchResult,
  postNodeSaveResult,
  postPreparedTextResult,
  postTextResult,
  prepareWorkerText,
  readMessageText,
  readNamedMessageText,
} from './jsonWorkerTextPayload';

interface EditJsonCacheEntry {
  originalText: string;
  originalValue: JsonValue;
}

interface JsonNodeEditOperations {
  deleteJsonNodeForEdit: (
    tabId: string,
    originalText: string | undefined,
    path: JsonEditPath | undefined,
    rawRevision?: number
  ) => SaveNodeEditResult;
  readJsonNodeForEdit: (tabId: string, text: string | undefined, offset: number | undefined) => string;
  renameJsonNodeKeyForEdit: (
    tabId: string,
    text: string,
    originalText: string | undefined,
    path: JsonEditPath | undefined,
    rawRevision?: number
  ) => SaveNodeEditResult;
  saveJsonNodeForEdit: (
    tabId: string,
    text: string,
    originalText: string | undefined,
    path: JsonEditPath | undefined,
    rawRevision?: number
  ) => SaveNodeEditResult;
}

interface JsonWorkerEditJsonOperationsArgs {
  editJsonCache: Map<string, EditJsonCacheEntry>;
  jsonNodeEditOperations: JsonNodeEditOperations;
  rawDocumentCache?: Map<string, RawDocumentCacheEntry>;
  structureCache?: { delete: (tabId: string) => boolean };
  viewerCache?: Map<
    string,
    {
      formattedText: string;
      formattedMetrics?: ReturnType<typeof measureJsonDocument>;
      requestId: number;
      viewerData: LargeJsonLineIndex;
    }
  >;
}

class MissingWorkerTextError extends Error {
  constructor() {
    super('Worker 文本缓存不可用');
    this.name = 'MissingWorkerTextError';
  }
}

type EditJsonWorkerRequestMessage = Omit<EditJsonWorkerRequest, 'text'> & {
  requestId: number;
  text?: string;
  textBuffer?: ArrayBuffer;
  originalTextBuffer?: ArrayBuffer;
  type?: 'edit-json';
};

function postWorkerMessage(message: WorkerMessage, transfer: Transferable[] = []) {
  if (transfer.length > 0) {
    (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(
      message,
      transfer
    );
    return;
  }

  postMessage(message);
}

function formatJsonForEdit(tabId: string, text: string, editJsonCache: Map<string, EditJsonCacheEntry>) {
  const { value, normalizedNestedString } = parseJsonForFormatting(text);

  if (normalizedNestedString) {
    editJsonCache.delete(tabId);
  } else {
    editJsonCache.set(tabId, {
      originalText: text,
      originalValue: value as JsonValue,
    });
  }

  return JSON.stringify(value, null, 2);
}

function saveJsonForEdit(
  tabId: string,
  text: string,
  originalText: string | undefined,
  editJsonCache: Map<string, EditJsonCacheEntry>
) {
  if (typeof originalText === 'string') {
    const cached = editJsonCache.get(tabId);
    const saved = saveJsonPreservingOriginalFormat(
      originalText,
      text,
      cached?.originalText === originalText ? { originalValue: cached.originalValue } : undefined
    );

    editJsonCache.delete(tabId);
    return saved;
  }

  return formatJsonForEdit(tabId, text, editJsonCache);
}

function copyJsonAsStringLiteral(text: string) {
  return JSON.stringify(JSON.stringify(JSON.parse(text)));
}

function transformJsonEscape(operation: EditJsonWorkerOperation, text: string) {
  return operation === 'escape-json' ? escapeJsonStringLiteral(text) : unescapeJsonStringLiteral(text);
}

function postNodeMutationResult(
  result: SaveNodeEditResult,
  requestId: number,
  tabId: string,
  operation: EditJsonWorkerOperation
) {
  const payload = {
    type: 'edit-json-result' as const,
    requestId,
    tabId,
    operation,
    success: true,
    structureWarming: result.structureWarming,
    rawViewerData: result.rawViewerData,
    viewerData: result.viewerData,
    viewerIndexMs: result.viewerIndexMs,
    viewerPatchApplied: result.viewerPatchApplied,
    rawMetrics: result.rawMetrics,
    formattedMetrics: result.formattedMetrics ?? undefined,
  };
  const canUsePatchResponse =
    canInlineJsonTextPatch(result.rawPatch) &&
    (result.formattedPatch === null || canInlineJsonTextPatch(result.formattedPatch));

  if (canUsePatchResponse) {
    postNodePatchResult(payload, result.rawPatch, result.formattedPatch);
    return;
  }

  postNodeSaveResult(
    payload,
    result.rawText,
    result.formattedText,
    result.rawMetrics.textByteLength,
    result.formattedMetrics?.textByteLength
  );
}

export function createJsonWorkerEditJsonOperations({
  editJsonCache,
  jsonNodeEditOperations,
  rawDocumentCache = new Map(),
  structureCache = new Map(),
  viewerCache = new Map(),
}: JsonWorkerEditJsonOperationsArgs) {
  function handleEditJsonMessage(message: EditJsonWorkerRequestMessage) {
    const { requestId, tabId, operation, path, offset, rawRevision, replacement, searchOptions, searchTerm } = message;
    const suppliedText = readMessageText(message);
    const cachedRaw = rawDocumentCache.get(tabId);
    const canReuseText = message.reuseText && typeof rawRevision === 'number' && cachedRaw?.rawRevision === rawRevision;
    const text = canReuseText ? cachedRaw.rawText : suppliedText;
    const originalText = readNamedMessageText(message, 'originalText', 'originalTextBuffer');

    try {
      if (message.reuseText && !canReuseText && !suppliedText) {
        throw new MissingWorkerTextError();
      }

      const data = (() => {
        if (operation === 'copy-literal') {
          return copyJsonAsStringLiteral(text);
        }

        if (operation === 'escape-json' || operation === 'unescape-json') {
          return transformJsonEscape(operation, text);
        }

        if (operation === 'replace-text') {
          return replaceTextSearchMatches(
            text,
            searchTerm ?? '',
            searchOptions ?? DEFAULT_SEARCH_OPTIONS,
            replacement ?? ''
          );
        }

        if (operation === 'read-node') {
          return jsonNodeEditOperations.readJsonNodeForEdit(tabId, text, offset);
        }

        if (operation === 'save-node') {
          const result = jsonNodeEditOperations.saveJsonNodeForEdit(tabId, text, originalText, path, rawRevision);
          postNodeMutationResult(result, requestId, tabId, operation);
          return null;
        }

        if (operation === 'delete-node') {
          const result = jsonNodeEditOperations.deleteJsonNodeForEdit(tabId, originalText, path, rawRevision);
          postNodeMutationResult(result, requestId, tabId, operation);
          return null;
        }

        if (operation === 'rename-node-key') {
          const result = jsonNodeEditOperations.renameJsonNodeKeyForEdit(tabId, text, originalText, path, rawRevision);
          postNodeMutationResult(result, requestId, tabId, operation);
          return null;
        }

        if (operation === 'save') {
          if (message.preserveRawText) {
            // Raw-error editing must not reserialize unrelated numbers, keys or whitespace.
            JSON.parse(text);
            editJsonCache.delete(tabId);
            return text;
          }
          return saveJsonForEdit(tabId, text, originalText, editJsonCache);
        }

        return formatJsonForEdit(tabId, text, editJsonCache);
      })();

      if (data === null) {
        return;
      }

      if (operation === 'replace-text' || operation === 'escape-json' || operation === 'unescape-json') {
        const isWholeDocumentEscapeTransform =
          (operation === 'escape-json' || operation === 'unescape-json') &&
          message.reuseText &&
          typeof rawRevision === 'number';
        const preparedData = isWholeDocumentEscapeTransform ? prepareWorkerText(data) : null;
        const rawMetrics = preparedData
          ? measureJsonDocumentWithKnownByteLength(data, preparedData.byteLength)
          : undefined;
        const formattedMatchesRaw = !isJsonContainerText(text) && !isJsonContainerText(data);
        const rawViewerData =
          rawMetrics && rawMetrics.textByteLength >= LARGE_FILE_THRESHOLD
            ? formattedMatchesRaw || operation === 'escape-json'
              ? buildEscapedStringLiteralRawViewerData(data.length)
              : buildLargeRawViewerData(data)
            : undefined;
        const viewerData =
          formattedMatchesRaw && rawMetrics && shouldUseDedicatedRightViewerForMetrics(rawMetrics, rawMetrics)
            ? buildLargeLiteralViewerData(data.length)
            : undefined;
        if (isWholeDocumentEscapeTransform && rawMetrics) {
          rawDocumentCache.set(tabId, { rawMetrics, rawRevision: rawRevision + 1, rawText: data });
        }
        if (formattedMatchesRaw) {
          structureCache.delete(tabId);
          if (rawMetrics && viewerData) {
            viewerCache.set(tabId, {
              formattedMetrics: rawMetrics,
              formattedText: data,
              requestId,
              viewerData: {
                lineCount: viewerData.lineCount,
                lineStarts: viewerData.lineStarts.slice(),
                literalChunks: true,
              },
            });
          } else {
            viewerCache.delete(tabId);
          }
        }
        const payload = {
          type: 'edit-json-result' as const,
          requestId,
          tabId,
          operation,
          success: true,
          rawMetrics,
          rawViewerData,
          formattedMatchesRaw,
          formattedMetrics: formattedMatchesRaw ? rawMetrics : undefined,
          viewerData,
        };
        if (preparedData) {
          postPreparedTextResult(payload, preparedData);
        } else {
          postTextResult(payload, data);
        }
        return;
      }

      postWorkerMessage({
        type: 'edit-json-result',
        requestId,
        tabId,
        operation,
        success: true,
        data,
      });
    } catch (err) {
      postWorkerMessage({
        type: 'edit-json-result',
        requestId,
        tabId,
        operation,
        success: false,
        requiresOriginalText: err instanceof MissingOriginalJsonTextError,
        requiresText: err instanceof MissingWorkerTextError,
        error: err instanceof Error ? err.message : 'JSON 处理失败',
        errorKind: err instanceof SyntaxError ? 'syntax' : undefined,
        errorLocation: err instanceof SyntaxError ? findJsonParseError(text, rawRevision ?? 0) : undefined,
      });
    }
  }

  return {
    handleEditJsonMessage,
  };
}

function isJsonContainerText(text: string) {
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

export type { EditJsonCacheEntry, EditJsonWorkerRequestMessage, JsonNodeEditOperations };
