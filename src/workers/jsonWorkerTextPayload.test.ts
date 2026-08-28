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
  readNamedMessageText,
} from './jsonWorkerTextPayload';

describe('jsonWorkerTextPayload', () => {
  it('reads string and buffer worker message text', () => {
    const encoded = new TextEncoder().encode('{"ok":true}');

    expect(readMessageText({ text: '{"ok":true}' })).toBe('{"ok":true}');
    expect(readMessageText({ textBuffer: encoded.buffer })).toBe('{"ok":true}');
    expect(readMessageText({})).toBe('');
    expect(readNamedMessageText({ originalText: '[]' }, 'originalText', 'originalTextBuffer')).toBe('[]');
    expect(
      readNamedMessageText(
        { originalTextBuffer: new TextEncoder().encode('[1]').buffer },
        'originalText',
        'originalTextBuffer'
      )
    ).toBe('[1]');
    expect(readNamedMessageText({}, 'originalText', 'originalTextBuffer')).toBeUndefined();
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

    const packedBuffer = new ArrayBuffer(12);
    expect(
      getRawViewerTransferables({
        starts: new Uint32Array(packedBuffer, 0, 2),
        lengths: new Uint16Array(packedBuffer, 8, 2),
        rowCount: 2,
      })
    ).toEqual([packedBuffer]);
  });

  it('keeps only a copied line index in the worker and transfers the complete viewer index', () => {
    const regionBuffer = new ArrayBuffer(13);
    const viewerData = {
      lineCount: 3,
      lineStarts: Uint32Array.from([0, 5, 10]),
      regions: {
        startLines: new Uint32Array(regionBuffer, 0, 1),
        endLines: new Uint32Array(regionBuffer, 4, 1),
        parentIndexes: new Int32Array(regionBuffer, 8, 1),
        kinds: new Uint8Array(regionBuffer, 12, 1),
      },
    };
    viewerData.regions.startLines[0] = 1;
    viewerData.regions.endLines[0] = 3;
    viewerData.regions.parentIndexes[0] = -1;
    viewerData.regions.kinds[0] = 1;

    const workerLineIndex = copyLargeViewerLineIndex(viewerData);

    expect(workerLineIndex).toEqual({ lineCount: 3, lineStarts: Uint32Array.from([0, 5, 10]) });
    expect(workerLineIndex.lineStarts.buffer).not.toBe(viewerData.lineStarts.buffer);
    expect(getLargeViewerTransferables(viewerData)).toEqual([viewerData.lineStarts.buffer, regionBuffer]);
  });

  it('preserves every packed region view across a deduplicated transferable clone', () => {
    const regionBuffer = new ArrayBuffer(26);
    const viewerData = {
      lineCount: 3,
      lineStarts: Uint32Array.from([0, 5, 10]),
      regions: {
        startLines: new Uint32Array(regionBuffer, 0, 2),
        endLines: new Uint32Array(regionBuffer, 8, 2),
        parentIndexes: new Int32Array(regionBuffer, 16, 2),
        kinds: new Uint8Array(regionBuffer, 24, 2),
      },
    };
    viewerData.regions.startLines.set([1, 2]);
    viewerData.regions.endLines.set([3, 3]);
    viewerData.regions.parentIndexes.set([-1, 0]);
    viewerData.regions.kinds.set([0, 1]);

    const cloned = structuredClone(viewerData, { transfer: getLargeViewerTransferables(viewerData) });

    expect(Array.from(cloned.lineStarts)).toEqual([0, 5, 10]);
    expect(Array.from(cloned.regions.startLines)).toEqual([1, 2]);
    expect(Array.from(cloned.regions.endLines)).toEqual([3, 3]);
    expect(Array.from(cloned.regions.parentIndexes)).toEqual([-1, 0]);
    expect(Array.from(cloned.regions.kinds)).toEqual([0, 1]);
    expect(cloned.regions.startLines.buffer).toBe(cloned.regions.kinds.buffer);
  });

  it('posts large node-save texts and both viewer indexes as transferable buffers', () => {
    const postMessageSpy = vi.fn();
    vi.stubGlobal('postMessage', postMessageSpy);
    const rawViewerData = {
      starts: Uint32Array.from([0]),
      lengths: Uint16Array.from([2]),
      rowCount: 1,
    };
    const regionBuffer = new ArrayBuffer(0);
    const viewerData = {
      lineCount: 1,
      lineStarts: Uint32Array.from([0]),
      regions: {
        startLines: new Uint32Array(regionBuffer),
        endLines: new Uint32Array(regionBuffer),
        parentIndexes: new Int32Array(regionBuffer),
        kinds: new Uint8Array(regionBuffer),
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
      regionBuffer,
    ]);
  });
});
