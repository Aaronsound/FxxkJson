// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerMessage } from '../types/jsonTool';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { measureJsonDocument } from '../utils/jsonDocumentMetrics';
import { MissingOriginalJsonTextError } from './jsonNodeEditOperations';
import { createJsonWorkerEditJsonOperations } from './jsonWorkerEditJsonOperations';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createJsonWorkerEditJsonOperations', () => {
  function createNodeMutationResult(rawText = '{}') {
    return {
      formattedPatch: { sourceLength: 2, startOffset: 1, endOffset: 1, text: '\n' },
      formattedText: '{\n}',
      formattedMetrics: measureJsonDocument('{\n}'),
      rawPatch: { sourceLength: 2, startOffset: 1, endOffset: 1, text: '' },
      rawText,
      rawMetrics: measureJsonDocument(rawText),
      rawViewerData: null,
      structureWarming: false,
      viewerData: null,
      viewerIndexMs: 0,
      viewerPatchApplied: false,
    };
  }

  it('decodes transferable replace input and transfers a large replacement result', () => {
    const postMessage = vi.fn<(message: unknown, transfer: Transferable[]) => void>();
    vi.stubGlobal('self', { postMessage });
    const source = `needle ${'x'.repeat(LARGE_FILE_THRESHOLD)}`;
    const inputBuffer = new TextEncoder().encode(source).buffer as ArrayBuffer;
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => {
          throw new Error('not called');
        }),
      },
    });

    operations.handleEditJsonMessage({
      type: 'edit-json',
      requestId: 7,
      tabId: 'tab-a',
      operation: 'replace-text',
      textBuffer: inputBuffer,
      searchTerm: 'needle',
      searchOptions: { matchCase: true, wholeWord: true, useRegex: false },
      replacement: 'updated',
    });

    const message = postMessage.mock.calls[0][0] as WorkerMessage;
    const transfer = postMessage.mock.calls[0][1];
    expect(message).toMatchObject({
      type: 'edit-json-result',
      requestId: 7,
      tabId: 'tab-a',
      operation: 'replace-text',
      success: true,
    });
    expect(message.data).toBeUndefined();
    expect(message.dataBuffer).toBeInstanceOf(ArrayBuffer);
    expect(transfer).toEqual([message.dataBuffer]);
    expect(new TextDecoder().decode(message.dataBuffer)).toBe(`updated ${'x'.repeat(LARGE_FILE_THRESHOLD)}`);
  });

  it('decodes a transferable original document for node mutations', () => {
    const postMessage = vi.fn<(message: unknown, transfer: Transferable[]) => void>();
    vi.stubGlobal('self', { postMessage });
    const deleteJsonNodeForEdit = vi.fn(() => createNodeMutationResult('{"kept":true}'));
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit,
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
    });
    const originalTextBuffer = new TextEncoder().encode('{"remove":1,"kept":true}').buffer as ArrayBuffer;

    operations.handleEditJsonMessage({
      type: 'edit-json',
      requestId: 8,
      tabId: 'tab-a',
      operation: 'delete-node',
      text: '',
      originalTextBuffer,
      path: ['remove'],
    });

    expect(deleteJsonNodeForEdit).toHaveBeenCalledWith('tab-a', '{"remove":1,"kept":true}', ['remove'], undefined);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit-json-result',
        requestId: 8,
        rawPatch: expect.any(Object),
        formattedPatch: expect.any(Object),
      }),
      []
    );
  });

  it('requests a full original document when the revision cache is unavailable', () => {
    const postMessage = vi.fn<(message: unknown, transfer?: Transferable[]) => void>();
    vi.stubGlobal('self', { postMessage });
    vi.stubGlobal('postMessage', postMessage);
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => {
          throw new MissingOriginalJsonTextError();
        }),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
    });

    operations.handleEditJsonMessage({
      type: 'edit-json',
      requestId: 9,
      tabId: 'tab-a',
      operation: 'delete-node',
      text: '',
      rawRevision: 4,
      path: ['remove'],
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit-json-result',
        requestId: 9,
        success: false,
        requiresOriginalText: true,
      })
    );
  });

  it('formats JSON, caches its original value, and drops the cache for nested JSON strings', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage: vi.fn() });
    const editJsonCache = new Map();
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache,
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
    });

    operations.handleEditJsonMessage({
      requestId: 10,
      tabId: 'tab-format',
      operation: 'format',
      text: '{"value":1}',
    });

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: true, data: '{\n  "value": 1\n}' })
    );
    expect(editJsonCache.get('tab-format')).toEqual({ originalText: '{"value":1}', originalValue: { value: 1 } });

    operations.handleEditJsonMessage({
      requestId: 11,
      tabId: 'tab-format',
      operation: 'format',
      text: JSON.stringify('{"nested":true}'),
    });
    expect(editJsonCache.has('tab-format')).toBe(false);
  });

  it('saves edits against the cached original formatting and releases the cache', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage: vi.fn() });
    const editJsonCache = new Map();
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache,
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
    });
    const originalText = '{"value": 1}';

    operations.handleEditJsonMessage({ requestId: 12, tabId: 'tab-save', operation: 'format', text: originalText });
    operations.handleEditJsonMessage({
      requestId: 13,
      tabId: 'tab-save',
      operation: 'save',
      text: '{\n  "value": 2\n}',
      originalText: originalText,
    });

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 13, success: true, data: '{"value":2}' })
    );
    expect(editJsonCache.has('tab-save')).toBe(false);
  });

  it.each([
    ['copy-literal', '{"value":1}', '"{\\"value\\":1}"'],
    ['escape-json', '{"value":1}', '"{\\"value\\":1}"'],
    ['unescape-json', '"{\\"value\\":1}"', '{"value":1}'],
  ] as const)('handles the %s text transform', (operation, text, expected) => {
    const postMessage = vi.fn();
    const postTransferableMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage: postTransferableMessage });
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
    });

    operations.handleEditJsonMessage({ requestId: 14, tabId: 'tab-transform', operation, text });

    const target = operation === 'copy-literal' ? postMessage : postTransferableMessage;
    expect(target).toHaveBeenCalledWith(
      expect.objectContaining({ operation, success: true, data: expected }),
      ...(operation === 'copy-literal' ? [] : [[]])
    );
  });

  it('reuses the cached raw document for consecutive whole-document escapes', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage });
    const source = '{"value":1}';
    const rawDocumentCache = new Map([
      ['tab-transform-cache', { rawMetrics: measureJsonDocument(source), rawRevision: 4, rawText: source }],
    ]);
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
      rawDocumentCache,
    });

    operations.handleEditJsonMessage({
      requestId: 141,
      tabId: 'tab-transform-cache',
      operation: 'escape-json',
      rawRevision: 4,
      reuseText: true,
    });

    const escaped = JSON.stringify(source);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: escaped, rawMetrics: measureJsonDocument(escaped), success: true }),
      []
    );
    expect(rawDocumentCache.get('tab-transform-cache')).toMatchObject({ rawRevision: 5, rawText: escaped });
  });

  it('unescapes a cached whole document without parsing the decoded JSON object tree', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage });
    const decoded = `[{"message":"${'x'.repeat(4096)}"}]`;
    const escaped = JSON.stringify(decoded);
    const rawDocumentCache = new Map([
      ['tab-unescape-cache', { rawMetrics: measureJsonDocument(escaped), rawRevision: 9, rawText: escaped }],
    ]);
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
      rawDocumentCache,
    });
    const parseSpy = vi.spyOn(JSON, 'parse');

    operations.handleEditJsonMessage({
      requestId: 144,
      tabId: 'tab-unescape-cache',
      operation: 'unescape-json',
      rawRevision: 9,
      reuseText: true,
    });

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ data: decoded, success: true }), []);
    parseSpy.mockRestore();
  });

  it('returns and caches a virtual formatted viewer for a deeper large escape', () => {
    const postMessage = vi.fn<(message: WorkerMessage, transfer: Transferable[]) => void>();
    vi.stubGlobal('self', { postMessage });
    const source = JSON.stringify('x'.repeat(LARGE_FILE_THRESHOLD));
    const rawDocumentCache = new Map([
      ['tab-deep-escape', { rawMetrics: measureJsonDocument(source), rawRevision: 8, rawText: source }],
    ]);
    const viewerCache = new Map();
    const structureCache = new Map([['tab-deep-escape', { formattedText: '{"stale":true}' }]]);
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
      rawDocumentCache,
      structureCache,
      viewerCache,
    });

    operations.handleEditJsonMessage({
      requestId: 143,
      tabId: 'tab-deep-escape',
      operation: 'escape-json',
      rawRevision: 8,
      reuseText: true,
    });

    const message = postMessage.mock.calls[0][0];
    expect(message).toMatchObject({
      formattedMatchesRaw: true,
      formattedMetrics: expect.objectContaining({ lineCount: 1 }),
      viewerData: expect.objectContaining({ literalChunks: true }),
    });
    expect(viewerCache.get('tab-deep-escape')).toMatchObject({
      formattedText: JSON.stringify(source),
      viewerData: expect.objectContaining({ literalChunks: true }),
    });
    expect(structureCache.has('tab-deep-escape')).toBe(false);
  });

  it('returns the virtual formatted result immediately when unescaping between string layers', () => {
    const postMessage = vi.fn<(message: WorkerMessage, transfer: Transferable[]) => void>();
    vi.stubGlobal('self', { postMessage });
    const singleEscaped = JSON.stringify('x'.repeat(LARGE_FILE_THRESHOLD));
    const doubleEscaped = JSON.stringify(singleEscaped);
    const rawDocumentCache = new Map([
      [
        'tab-deep-unescape',
        { rawMetrics: measureJsonDocument(doubleEscaped), rawRevision: 10, rawText: doubleEscaped },
      ],
    ]);
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
      rawDocumentCache,
    });

    operations.handleEditJsonMessage({
      requestId: 145,
      tabId: 'tab-deep-unescape',
      operation: 'unescape-json',
      rawRevision: 10,
      reuseText: true,
    });

    expect(postMessage.mock.calls[0][0]).toMatchObject({
      formattedMatchesRaw: true,
      formattedMetrics: expect.objectContaining({ lineCount: 1 }),
      rawViewerData: expect.objectContaining({ rowCount: expect.any(Number) }),
      viewerData: expect.objectContaining({ literalChunks: true }),
    });
  });

  it('requests the source text when a reusable transform cache is unavailable', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage });
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
      rawDocumentCache: new Map(),
    });

    operations.handleEditJsonMessage({
      requestId: 142,
      tabId: 'tab-transform-cache-miss',
      operation: 'escape-json',
      rawRevision: 4,
      reuseText: true,
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 142, requiresText: true, success: false })
    );
  });

  it('reads a node through the cached node operation', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage: vi.fn() });
    const readJsonNodeForEdit = vi.fn(() => '42');
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit,
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
    });

    operations.handleEditJsonMessage({
      requestId: 15,
      tabId: 'tab-read',
      operation: 'read-node',
      text: '{"value":42}',
      offset: 9,
    });

    expect(readJsonNodeForEdit).toHaveBeenCalledWith('tab-read', '{"value":42}', 9);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: '42' }));
  });

  it('routes save and rename node mutations through compact patch responses', () => {
    const workerPostMessage = vi.fn();
    vi.stubGlobal('self', { postMessage: workerPostMessage });
    vi.stubGlobal('postMessage', vi.fn());
    const saveJsonNodeForEdit = vi.fn(() => createNodeMutationResult('{"saved":true}'));
    const renameJsonNodeKeyForEdit = vi.fn(() => createNodeMutationResult('{"renamed":true}'));
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit,
        saveJsonNodeForEdit,
      },
    });

    operations.handleEditJsonMessage({
      requestId: 16,
      tabId: 'tab-node',
      operation: 'save-node',
      text: 'true',
      originalText: '{"value":false}',
      path: ['value'],
      rawRevision: 3,
    });
    operations.handleEditJsonMessage({
      requestId: 17,
      tabId: 'tab-node',
      operation: 'rename-node-key',
      text: 'renamed',
      originalText: '{"value":false}',
      path: ['value'],
      rawRevision: 4,
    });

    expect(saveJsonNodeForEdit).toHaveBeenCalledWith('tab-node', 'true', '{"value":false}', ['value'], 3);
    expect(renameJsonNodeKeyForEdit).toHaveBeenCalledWith('tab-node', 'renamed', '{"value":false}', ['value'], 4);
    expect(workerPostMessage).toHaveBeenCalledTimes(2);
    expect(workerPostMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 17, operation: 'rename-node-key', rawPatch: expect.any(Object) }),
      []
    );
  });

  it('falls back to a full node response when a patch is too large', () => {
    const workerPostMessage = vi.fn();
    vi.stubGlobal('self', { postMessage: workerPostMessage });
    vi.stubGlobal('postMessage', vi.fn());
    const largePatchResult = {
      ...createNodeMutationResult('{"saved":true}'),
      rawPatch: { sourceLength: 2, startOffset: 1, endOffset: 1, text: 'x'.repeat(256 * 1024 + 1) },
    };
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => largePatchResult),
      },
    });

    operations.handleEditJsonMessage({
      requestId: 18,
      tabId: 'tab-full',
      operation: 'save-node',
      text: 'true',
      originalText: '{}',
      path: ['value'],
    });

    expect(workerPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 18, success: true, data: '{"saved":true}', formattedText: '{\n}' }),
      []
    );
  });

  it('returns a normal processing error for invalid JSON', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('self', { postMessage: vi.fn() });
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => createNodeMutationResult()),
        saveJsonNodeForEdit: vi.fn(() => createNodeMutationResult()),
      },
    });

    operations.handleEditJsonMessage({
      requestId: 19,
      tabId: 'tab-error',
      operation: 'format',
      text: '{invalid',
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 19, success: false, requiresOriginalText: false, error: expect.any(String) })
    );
  });
});
