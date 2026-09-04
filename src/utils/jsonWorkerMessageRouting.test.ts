// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { WorkerMessage, WorkerRequestMessage } from '../types/jsonTool';
import {
  getJsonWorkerMessageHandler,
  getJsonWorkerResultHandler,
  isJsonWorkerRequestMessage,
} from './jsonWorkerMessageRouting';

describe('isJsonWorkerRequestMessage', () => {
  it('accepts supported worker requests and rejects malformed envelopes', () => {
    expect(isJsonWorkerRequestMessage({ type: 'clear-locate-cache', tabId: 'tab-1' })).toBe(true);
    expect(isJsonWorkerRequestMessage({ type: 'clear-tab-cache', tabId: 'tab-1' })).toBe(true);
    expect(isJsonWorkerRequestMessage({ type: 'release-transient-cache', tabId: 'tab-1' })).toBe(true);
    expect(isJsonWorkerRequestMessage({ type: 'hydrate-viewer-cache', tabId: 'tab-1', requestId: 2 })).toBe(true);
    expect(isJsonWorkerRequestMessage({ type: 'search', tabId: 'tab-1', requestId: 1 })).toBe(true);
    expect(isJsonWorkerRequestMessage({ type: 'search', tabId: 'tab-1' })).toBe(false);
    expect(isJsonWorkerRequestMessage({ type: 'unknown', tabId: 'tab-1', requestId: 1 })).toBe(false);
  });
});

describe('getJsonWorkerMessageHandler', () => {
  it('returns the handler for a known worker message type', () => {
    const handler = vi.fn();
    const message: WorkerRequestMessage = { type: 'clear-locate-cache', tabId: 'tab-1' };

    expect(getJsonWorkerMessageHandler({ 'clear-locate-cache': handler }, message)).toBe(handler);
  });

  it('returns null when a handler is not registered', () => {
    const message: WorkerRequestMessage = { type: 'clear-locate-cache', tabId: 'tab-1' };

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
