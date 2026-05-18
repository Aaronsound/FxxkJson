// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type { WorkerMessage, WorkerRequestMessage } from '../types/jsonTool';
import { createJsonWorkerClient } from './jsonWorkerClient';

describe('createJsonWorkerClient', () => {
  it('posts worker requests with transferables', () => {
    const postMessage = vi.fn();
    const client = createJsonWorkerClient(() => ({ postMessage } as unknown as Worker));
    const request: WorkerRequestMessage = { type: 'clear-structure', tabId: 'tab-1' };
    const transfer = [new ArrayBuffer(1)];

    client.postRequest(request, transfer);

    expect(postMessage).toHaveBeenCalledWith(request, transfer);
  });

  it('keeps small text inline and transfers larger text as buffers', () => {
    const client = createJsonWorkerClient(() => null);
    const smallPayload = client.createTextPayload('{"ok":true}');
    const largePayload = client.createTextPayload('{"ok":true}', LARGE_FILE_THRESHOLD);

    expect(smallPayload.message).toEqual({ text: '{"ok":true}' });
    expect(smallPayload.transfer).toEqual([]);
    expect('textBuffer' in largePayload.message).toBe(true);
    expect(largePayload.transfer).toHaveLength(1);
  });

  it('reads string and buffer text fields', () => {
    const client = createJsonWorkerClient(() => null);
    const encoded = new TextEncoder().encode('buffer text').buffer as ArrayBuffer;

    expect(client.readText({ data: 'plain text' } as WorkerMessage)).toBe('plain text');
    expect(client.readText({ dataBuffer: encoded } as WorkerMessage)).toBe('buffer text');
    expect(client.readText({} as WorkerMessage)).toBeNull();
  });
});
