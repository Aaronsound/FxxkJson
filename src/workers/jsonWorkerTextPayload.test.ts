// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import {
  appendTextPayload,
  getTextByteLength,
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
});
