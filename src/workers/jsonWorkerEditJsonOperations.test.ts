// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerMessage } from '../types/jsonTool';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { createJsonWorkerEditJsonOperations } from './jsonWorkerEditJsonOperations';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createJsonWorkerEditJsonOperations', () => {
  it('decodes transferable replace input and transfers a large replacement result', () => {
    const postMessage = vi.fn<(message: unknown, transfer: Transferable[]) => void>();
    vi.stubGlobal('self', { postMessage });
    const source = `needle ${'x'.repeat(LARGE_FILE_THRESHOLD)}`;
    const inputBuffer = new TextEncoder().encode(source).buffer as ArrayBuffer;
    const operations = createJsonWorkerEditJsonOperations({
      editJsonCache: new Map(),
      jsonNodeEditOperations: {
        deleteJsonNodeForEdit: vi.fn(() => ''),
        readJsonNodeForEdit: vi.fn(() => ''),
        renameJsonNodeKeyForEdit: vi.fn(() => ''),
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
});
