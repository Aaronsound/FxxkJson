import { describe, expect, it, vi } from 'vitest';
import type { WorkerRequestMessage } from '../types/jsonTool';
import { getJsonWorkerMessageHandler } from './jsonWorkerMessageRouting';

describe('getJsonWorkerMessageHandler', () => {
  it('returns the handler for a known worker message type', () => {
    const handler = vi.fn();
    const message: WorkerRequestMessage = { type: 'clear-structure', tabId: 'tab-1' };

    expect(getJsonWorkerMessageHandler({ 'clear-structure': handler }, message)).toBe(handler);
  });

  it('returns null when a handler is not registered', () => {
    const message: WorkerRequestMessage = { type: 'clear-structure', tabId: 'tab-1' };

    expect(getJsonWorkerMessageHandler({}, message)).toBeNull();
  });
});
