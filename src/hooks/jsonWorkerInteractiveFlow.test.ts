// @vitest-environment node
import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { StructureStatus, WorkerMessage, WorkerRequestMessage } from '../types/jsonTool';
import { DEFAULT_SEARCH_OPTIONS, LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { packSearchMatches } from '../utils/searchMatchPayload';
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
  structureStatus?: StructureStatus;
  structureEnabled?: boolean;
  worker?: Worker;
}

function createFlow({
  activeTabId = 'tab-a',
  structureStatus = 'ready',
  structureEnabled = false,
  worker = { postMessage: vi.fn() } as unknown as Worker,
}: FlowTestOptions = {}) {
  const callbacks = createCallbacks();
  const requests: WorkerRequestMessage[] = [];
  const transfers: Array<Transferable[] | undefined> = [];
  const flow = createJsonWorkerInteractiveFlow({
    activeTabIdRef: { current: activeTabId },
    createWorkerTextPayload: (text, byteLength = text.length) => {
      if (byteLength >= LARGE_FILE_THRESHOLD) {
        const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer;
        return { message: { textBuffer: buffer }, transfer: [buffer] };
      }
      return { message: { text }, transfer: [] };
    },
    getCallbacks: () => callbacks,
    postWorkerRequest: (message, transfer) => {
      requests.push(message);
      transfers.push(transfer);
    },
    readWorkerTextField: (message, stringKey, bufferKey) => {
      if (typeof message[stringKey] === 'string') {
        return message[stringKey] ?? null;
      }
      const buffer = message[bufferKey];
      return buffer ? new TextDecoder().decode(buffer) : null;
    },
    structureStatusRef: recordRef<StructureStatus>({ 'tab-a': structureStatus }),
    workerRef: { current: worker },
    workerStructureEnabledRef: recordRef({ 'tab-a': structureEnabled }),
  });

  return { callbacks, flow, requests, transfers };
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

    flow.requestSearch({ tabId: 'tab-a', query: 'old', searchOptions: DEFAULT_SEARCH_OPTIONS });
    flow.requestSearch({ tabId: 'tab-a', query: 'new', searchOptions: DEFAULT_SEARCH_OPTIONS });
    flow.requestSearch({
      tabId: 'tab-a',
      query: 'left',
      searchOptions: DEFAULT_SEARCH_OPTIONS,
      startOffset: 20,
      append: true,
      target: 'left',
      text: '{"name":"new"}',
      rawRevision: 2,
    });

    const firstRequestId = 'requestId' in requests[0] ? requests[0].requestId : -1;
    const leftRequestId = 'requestId' in requests[2] ? requests[2].requestId : -1;
    const leftMatches = [{ start: 8, end: 11, lineNumber: 2, lineStartOffset: 6, localStart: 2, localEnd: 5 }];
    flow.handleResult(asResult({ type: 'search-result', requestId: firstRequestId, tabId: 'tab-a', matches: [] }));
    flow.handleResult(
      asResult({
        type: 'search-result',
        requestId: leftRequestId,
        tabId: 'tab-a',
        target: 'left',
        matchData: packSearchMatches(leftMatches),
        hasMore: true,
        nextStartOffset: 40,
        append: true,
      })
    );

    expect(callbacks.setLargeViewerSearchResults).not.toHaveBeenCalled();
    expect(callbacks.setLeftSearchResults).toHaveBeenCalledWith(
      'tab-a',
      [{ ...leftMatches[0], matchIndex: 0 }],
      true,
      40,
      true
    );
  });

  it('transfers large left-search source text instead of cloning the string', () => {
    const { flow, requests, transfers } = createFlow();

    flow.requestSearch({
      tabId: 'tab-a',
      query: 'needle',
      searchOptions: DEFAULT_SEARCH_OPTIONS,
      target: 'left',
      text: '{"needle":true}',
      textByteLength: LARGE_FILE_THRESHOLD,
      rawRevision: 2,
    });

    expect(requests[0]).toMatchObject({ type: 'search', rawRevision: 2 });
    expect('text' in requests[0]).toBe(false);
    expect('textBuffer' in requests[0] && requests[0].textBuffer).toBeInstanceOf(ArrayBuffer);
    expect(transfers[0]).toEqual(['textBuffer' in requests[0] ? requests[0].textBuffer : undefined]);
  });

  it('resolves edit-json requests from worker results', async () => {
    const { flow, requests } = createFlow();

    const edit = flow.requestEditJson({ tabId: 'tab-a', operation: 'escape-json', text: '{"ok":true}' });
    const editRequestId = 'requestId' in requests[0] ? requests[0].requestId : -1;
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

  it('transfers every large edit source while keeping small edit requests inline', () => {
    const { flow, requests, transfers } = createFlow();

    void flow.requestEditJson({
      tabId: 'tab-a',
      operation: 'replace-text',
      text: '{"needle":true}',
      textByteLength: LARGE_FILE_THRESHOLD,
      searchTerm: 'needle',
      searchOptions: DEFAULT_SEARCH_OPTIONS,
      replacement: 'value',
    });
    void flow.requestEditJson({ tabId: 'tab-a', operation: 'escape-json', text: '{"ok":true}' });
    void flow.requestEditJson({
      tabId: 'tab-a',
      operation: 'save-node',
      text: 'true',
      originalText: '{"large":true}',
      originalTextByteLength: LARGE_FILE_THRESHOLD,
      path: ['large'],
    });

    expect(requests[0]).toMatchObject({ type: 'edit-json', operation: 'replace-text' });
    expect('text' in requests[0]).toBe(false);
    expect('textBuffer' in requests[0] && requests[0].textBuffer).toBeInstanceOf(ArrayBuffer);
    expect(transfers[0]).toEqual(['textBuffer' in requests[0] ? requests[0].textBuffer : undefined]);
    expect(requests[1]).toMatchObject({ type: 'edit-json', operation: 'escape-json', text: '{"ok":true}' });
    expect(transfers[1]).toEqual([]);
    expect(requests[2]).toMatchObject({ type: 'edit-json', operation: 'save-node', text: 'true' });
    expect('originalText' in requests[2]).toBe(false);
    expect('originalTextBuffer' in requests[2] && requests[2].originalTextBuffer).toBeInstanceOf(ArrayBuffer);
    expect(transfers[2]).toEqual(['originalTextBuffer' in requests[2] ? requests[2].originalTextBuffer : undefined]);
  });

  it('decodes transferable raw and formatted node-save text results', async () => {
    const { flow, requests } = createFlow();
    const encoder = new TextEncoder();
    const edit = flow.requestEditJsonResult({ tabId: 'tab-a', operation: 'save-node', text: 'true' });
    const editRequestId = 'requestId' in requests[0] ? requests[0].requestId : -1;

    flow.handleResult(
      asResult({
        type: 'edit-json-result',
        requestId: editRequestId,
        tabId: 'tab-a',
        success: true,
        dataBuffer: encoder.encode('{"ok":true}').buffer,
        formattedTextBuffer: encoder.encode('{\n  "ok": true\n}').buffer,
      })
    );

    await expect(edit).resolves.toMatchObject({
      data: '{"ok":true}',
      formattedText: '{\n  "ok": true\n}',
    });
  });

  it('resolves node-save patch results without requiring full text payloads', async () => {
    const { flow, requests } = createFlow();
    const edit = flow.requestEditJsonResult({ tabId: 'tab-a', operation: 'save-node', text: 'true' });
    const editRequestId = 'requestId' in requests[0] ? requests[0].requestId : -1;
    const rawPatch = { sourceLength: 12, startOffset: 6, endOffset: 11, text: 'true' };

    flow.handleResult(
      asResult({
        type: 'edit-json-result',
        requestId: editRequestId,
        tabId: 'tab-a',
        success: true,
        rawPatch,
      })
    );

    await expect(edit).resolves.toMatchObject({ rawPatch });
  });
});
