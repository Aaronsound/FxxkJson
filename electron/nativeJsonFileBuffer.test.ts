// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NativeJsonFileBuffer } from './nativeJsonFileBuffer';

describe('NativeJsonFileBuffer', () => {
  it('decodes multibyte JSON only after all byte chunks arrive', () => {
    const source = '{"message":"你好，JSON 👋"}';
    const bytes = new TextEncoder().encode(source);
    const buffer = new NativeJsonFileBuffer(bytes.byteLength);

    buffer.append(bytes.subarray(0, 14));
    buffer.append(bytes.subarray(14, 17));
    buffer.append(bytes.subarray(17));

    const result = buffer.finish();
    expect(result.text).toBe(source);
    expect(new Uint8Array(result.buffer)).toEqual(bytes);
  });

  it('uses the received byte count when the file shrinks after metadata is read', () => {
    const buffer = new NativeJsonFileBuffer(128);
    buffer.append(new TextEncoder().encode('{"ok":true}'));

    const result = buffer.finish();
    expect(result.text).toBe('{"ok":true}');
    expect(result.buffer.byteLength).toBe(11);
  });

  it('grows safely when the file expands after metadata is read', () => {
    const source = JSON.stringify({ payload: 'x'.repeat(1024 * 1024) });
    const bytes = new TextEncoder().encode(source);
    const buffer = new NativeJsonFileBuffer(4);

    buffer.append(bytes.subarray(0, 128));
    buffer.append(bytes.subarray(128));

    const result = buffer.finish();
    expect(result.text).toBe(source);
    expect(result.buffer.byteLength).toBe(bytes.byteLength);
  });

  it('rejects invalid file sizes', () => {
    expect(() => new NativeJsonFileBuffer(-1)).toThrow('non-negative safe integer');
    expect(() => new NativeJsonFileBuffer(Number.POSITIVE_INFINITY)).toThrow('non-negative safe integer');
  });
});
