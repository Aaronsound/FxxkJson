// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { WorkerMessage, WorkerRequestMessage } from '../types/jsonTool';
import {
  getJsonWorkerMessageHandler,
  getJsonWorkerResultHandler,
} from './jsonWorkerMessageRouting';

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

describe('getJsonWorkerResultHandler', () => {
  it('returns the handler for a known worker result type', () => {
    const handler = vi.fn();
    const message: WorkerMessage = {
      type: 'format-result',
      requestId: 1,
      tabId: 'tab-1',
      success: true,
      data: '{}',
    };

    expect(getJsonWorkerResultHandler({ 'format-result': handler }, message)).toBe(handler);
  });

  it('returns null when a result handler is not registered', () => {
    const message: WorkerMessage = {
      type: 'viewer-ready',
      requestId: 1,
      tabId: 'tab-1',
    };

    expect(getJsonWorkerResultHandler({}, message)).toBeNull();
  });
});
