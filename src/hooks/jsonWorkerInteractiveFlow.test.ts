// @vitest-environment node
import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';
import type { StructureStatus, WorkerMessage, WorkerRequestMessage } from '../types/jsonTool';
import { createJsonWorkerInteractiveFlow, type JsonWorkerInteractiveCallbacks } from './jsonWorkerInteractiveFlow';

function recordRef<T>(current: Record<string, T>) {
  return { current } as MutableRefObject<Record<string, T>>;
}

function createCallbacks(): JsonWorkerInteractiveCallbacks {
  return {
    revealLeftRange: vi.fn(),
    setLargeViewerSearchResults: vi.fn(),
    setLeftSearchResults: vi.fn(),
    setLocateFeedback: vi.fn(),
    setProcessingStage: vi.fn(),
    setRightNodeSelection: vi.fn(),
    setStructureStatus: vi.fn(),
  };
}

interface FlowTestOptions {
  activeTabId?: string;
  formattedText?: string;
  structureStatus?: StructureStatus;
  structureEnabled?: boolean;
  worker?: Worker;
}

function createFlow({
  activeTabId = 'tab-a',
  formattedText = '{\n  "name": "demo"\n}',
  structureStatus = 'ready',
  structureEnabled = false,
  worker = { postMessage: vi.fn() } as unknown as Worker,
}: FlowTestOptions = {}) {
  const callbacks = createCallbacks();
  const requests: WorkerRequestMessage[] = [];
  const flow = createJsonWorkerInteractiveFlow({
    activeTabIdRef: { current: activeTabId },
    formattedTextByTabRef: recordRef({ 'tab-a': formattedText }),
    getCallbacks: () => callbacks,
    postWorkerRequest: (message) => {
      requests.push(message);
    },
    structureStatusRef: recordRef<StructureStatus>({ 'tab-a': structureStatus }),
    workerRef: { current: worker },
    workerStructureEnabledRef: recordRef({ 'tab-a': structureEnabled }),
  });

  return { callbacks, flow, requests };
}

function asResult(message: WorkerMessage) {
  return message;
}

describe('createJsonWorkerInteractiveFlow', () => {
  it('chooses structural and direct right locate requests from the active locate state', () => {
    const structural = createFlow({ structureEnabled: true });
    structural.flow.requestLocate('tab-a', 12.9);

    expect(structural.requests[0]).toMatchObject({
      type: 'locate',
      offset: 12.9,
      tabId: 'tab-a',
    });
    expect(structural.callbacks.setLocateFeedback).toHaveBeenCalledWith(
      'tab-a',
      expect.objectContaining({ status: 'pending' })
    );

    const direct = createFlow({ structureStatus: 'building', structureEnabled: true });
    direct.flow.requestLocate('tab-a', 8);
    expect(direct.requests[0]).toMatchObject({ type: 'locate-right-direct' });
  });

  it('applies only the latest active-tab search result', () => {
    const { callbacks, flow, requests } = createFlow();

    flow.requestSearch('tab-a', 'old', DEFAULT_SEARCH_OPTIONS);
    flow.requestSearch('tab-a', 'new', DEFAULT_SEARCH_OPTIONS);
    flow.requestSearch('tab-a', 'left', DEFAULT_SEARCH_OPTIONS, 20, true, 'left', '{"name":"new"}', 2);

    const firstRequestId = 'requestId' in requests[0] ? requests[0].requestId : -1;
    const leftRequestId = 'requestId' in requests[2] ? requests[2].requestId : -1;
    flow.handleResult(asResult({ type: 'search-result', requestId: firstRequestId, tabId: 'tab-a', matches: [] }));
    flow.handleResult(
      asResult({
        type: 'search-result',
        requestId: leftRequestId,
        tabId: 'tab-a',
        target: 'left',
        matches: [],
        hasMore: true,
        nextStartOffset: 40,
        append: true,
      })
    );

    expect(callbacks.setLargeViewerSearchResults).not.toHaveBeenCalled();
    expect(callbacks.setLeftSearchResults).toHaveBeenCalledWith('tab-a', [], true, 40, true);
  });

  it('resolves cached value and edit-json requests from worker results', async () => {
    const { flow, requests } = createFlow({ formattedText: '' });

    const value = flow.requestValue('tab-a', 10, true);
    const valueRequestId = 'requestId' in requests[0] ? requests[0].requestId : -1;
    flow.handleResult(
      asResult({
        type: 'value-result',
        requestId: valueRequestId,
        tabId: 'tab-a',
        found: true,
        value: '"demo"',
      })
    );
    await expect(value).resolves.toBe('"demo"');

    const edit = flow.requestEditJson('tab-a', 'escape-json', '{"ok":true}');
    const editRequestId = 'requestId' in requests[1] ? requests[1].requestId : -1;
    flow.handleResult(
      asResult({
        type: 'edit-json-result',
        requestId: editRequestId,
        tabId: 'tab-a',
        success: true,
        data: '"{\\"ok\\":true}"',
      })
    );
    await expect(edit).resolves.toBe('"{\\"ok\\":true}"');
  });
});
