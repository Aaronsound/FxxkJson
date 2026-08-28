// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerMessage } from '../types/jsonTool';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { measureJsonDocument } from '../utils/jsonDocumentMetrics';
import { createJsonWorkerEditJsonOperations } from './jsonWorkerEditJsonOperations';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createJsonWorkerEditJsonOperations', () => {
  function createNodeMutationResult(rawText = '{}') {
    return {
      formattedText: '{\n}',
      formattedMetrics: measureJsonDocument('{\n}'),
      rawText,
      rawMetrics: measureJsonDocument(rawText),
      rawViewerData: null,
      structureWarming: false,
      viewerData: null,
      viewerIndexMs: 0,
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

    expect(deleteJsonNodeForEdit).toHaveBeenCalledWith('tab-a', '{"remove":1,"kept":true}', ['remove']);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit-json-result',
        requestId: 8,
        data: '{"kept":true}',
        formattedText: '{\n}',
      }),
      []
    );
  });
});
