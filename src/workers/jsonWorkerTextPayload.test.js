import { describe, expect, it } from 'vitest';
import {
  appendTextPayload,
  getTextByteLength,
  readMessageText,
} from './jsonWorkerTextPayload';

describe('jsonWorkerTextPayload', () => {
  it('reads string and buffer worker message text', () => {
    const encoded = new TextEncoder().encode('{"ok":true}');

    expect(readMessageText({ text: '{"ok":true}' })).toBe('{"ok":true}');
    expect(readMessageText({ textBuffer: encoded.buffer })).toBe('{"ok":true}');
  });

  it('measures UTF-8 byte length', () => {
    expect(getTextByteLength('abc')).toBe(3);
    expect(getTextByteLength('中文')).toBe(6);
  });

  it('keeps small payloads as strings', () => {
    const message: Record<string, unknown> = {};
    const transfer: ArrayBuffer[] = [];

    appendTextPayload(message, transfer, 'data', 'dataBuffer', '{}');

    expect(message.data).toBe('{}');
    expect(message.dataBuffer).toBeUndefined();
    expect(transfer).toHaveLength(0);
  });
});
