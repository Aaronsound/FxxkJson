import { describe, expect, it, vi } from 'vitest';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import {
  appendTextPayload,
  copyLargeViewerLineIndex,
  getLargeViewerTransferables,
  getRawViewerTransferables,
  getTextByteLength,
  postNodeSaveResult,
  postRepairResult,
  postTextResult,
  readMessageText,
} from './jsonWorkerTextPayload';

describe('jsonWorkerTextPayload', () => {
  it('reads string and buffer worker message text', () => {
    const encoded = new TextEncoder().encode('{"ok":true}');

    expect(readMessageText({ text: '{"ok":true}' })).toBe('{"ok":true}');
    expect(readMessageText({ textBuffer: encoded.buffer })).toBe('{"ok":true}');
    expect(readMessageText({})).toBe('');
  });

  it('measures UTF-8 byte length', () => {
    expect(getTextByteLength('abc')).toBe(3);
    expect(getTextByteLength('中文')).toBe(6);
  });

  it('keeps small payloads as strings', () => {
    const message: Record<string, unknown> = {};
    const transfer: Transferable[] = [];

    appendTextPayload(message, transfer, 'data', 'dataBuffer', '{}');

    expect(message.data).toBe('{}');
    expect(message.dataBuffer).toBeUndefined();
    expect(transfer).toHaveLength(0);
  });

  it('uses UTF-8 bytes to transfer large non-ASCII payloads', () => {
    const message: Record<string, unknown> = {};
    const transfer: Transferable[] = [];
    const text = '汉'.repeat(Math.ceil(LARGE_FILE_THRESHOLD / 3));

    appendTextPayload(message, transfer, 'data', 'dataBuffer', text);

    expect(message.data).toBeUndefined();
    expect(Object.prototype.toString.call(message.dataBuffer)).toBe('[object ArrayBuffer]');
    expect((message.dataBuffer as ArrayBuffer).byteLength).toBeGreaterThanOrEqual(LARGE_FILE_THRESHOLD);
    expect(transfer).toEqual([message.dataBuffer]);
  });

  it('posts text and repair results with transferable payloads when needed', () => {
    const postMessageSpy = vi.fn();
    vi.stubGlobal('postMessage', postMessageSpy);

    postTextResult({ requestId: 1, tabId: 'tab-a', type: 'format-result' }, '{}');
    postRepairResult({ requestId: 2, tabId: 'tab-a', type: 'repair-result' }, '{}', '{"ok":true}');

    expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ data: '{}', requestId: 1 }), []);
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: '{}', repairedText: '{"ok":true}', requestId: 2 }),
      []
    );
  });

  it('transfers compact raw viewer buffers with worker results', () => {
    const postMessageSpy = vi.fn();
    vi.stubGlobal('postMessage', postMessageSpy);
    const rawViewerData = {
      starts: Uint32Array.from([0, 20]),
      lengths: Uint16Array.from([20, 4]),
      rowCount: 2,
    };

    postTextResult({ requestId: 3, rawViewerData, tabId: 'tab-a', type: 'format-result' }, '{}');

    expect(getRawViewerTransferables(rawViewerData)).toEqual([
      rawViewerData.starts.buffer,
      rawViewerData.lengths.buffer,
    ]);
    expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ rawViewerData, requestId: 3 }), [
      rawViewerData.starts.buffer,
      rawViewerData.lengths.buffer,
    ]);
  });

  it('keeps only a copied line index in the worker and transfers the complete viewer index', () => {
    const viewerData = {
      lineCount: 3,
      lineStarts: Uint32Array.from([0, 5, 10]),
      regions: {
        startLines: Uint32Array.from([1]),
        endLines: Uint32Array.from([3]),
        parentIndexes: Int32Array.from([-1]),
        kinds: Uint8Array.from([1]),
      },
    };

    const workerLineIndex = copyLargeViewerLineIndex(viewerData);

    expect(workerLineIndex).toEqual({ lineCount: 3, lineStarts: Uint32Array.from([0, 5, 10]) });
    expect(workerLineIndex.lineStarts.buffer).not.toBe(viewerData.lineStarts.buffer);
    expect(getLargeViewerTransferables(viewerData)).toEqual([
      viewerData.lineStarts.buffer,
      viewerData.regions.startLines.buffer,
      viewerData.regions.endLines.buffer,
      viewerData.regions.parentIndexes.buffer,
      viewerData.regions.kinds.buffer,
    ]);
  });

  it('posts large node-save texts and both viewer indexes as transferable buffers', () => {
    const postMessageSpy = vi.fn();
    vi.stubGlobal('postMessage', postMessageSpy);
    const rawViewerData = {
      starts: Uint32Array.from([0]),
      lengths: Uint16Array.from([2]),
      rowCount: 1,
    };
    const viewerData = {
      lineCount: 1,
      lineStarts: Uint32Array.from([0]),
      regions: {
        startLines: new Uint32Array(0),
        endLines: new Uint32Array(0),
        parentIndexes: new Int32Array(0),
        kinds: new Uint8Array(0),
      },
    };

    postNodeSaveResult(
      { requestId: 4, rawViewerData, tabId: 'tab-a', type: 'edit-json-result', viewerData },
      '{}',
      '{\n}',
      LARGE_FILE_THRESHOLD,
      LARGE_FILE_THRESHOLD
    );

    const [message, transfer] = postMessageSpy.mock.calls[0];
    expect(message).toMatchObject({ requestId: 4, rawViewerData, viewerData });
    expect(message.data).toBeUndefined();
    expect(message.formattedText).toBeUndefined();
    expect(Object.prototype.toString.call(message.dataBuffer)).toBe('[object ArrayBuffer]');
    expect(Object.prototype.toString.call(message.formattedTextBuffer)).toBe('[object ArrayBuffer]');
    expect(transfer).toEqual([
      message.dataBuffer,
      message.formattedTextBuffer,
      rawViewerData.starts.buffer,
      rawViewerData.lengths.buffer,
      viewerData.lineStarts.buffer,
      viewerData.regions.startLines.buffer,
      viewerData.regions.endLines.buffer,
      viewerData.regions.parentIndexes.buffer,
      viewerData.regions.kinds.buffer,
    ]);
  });
});
