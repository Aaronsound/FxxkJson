// @vitest-environment node
import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeJsonFileImporter } from './nativeJsonFileImport';
import { NativeJsonFileBuffer } from './nativeJsonFileBuffer';

describe('native file import cancellation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const metadata = { type: 'selected', name: 'test.json', path: '/test.json', size: 100 };
  it('closes the transferred port before acknowledging a cancelled selection', async () => {
    vi.stubGlobal('MessageChannel', MessageChannel);
    let closed: Promise<void> | undefined;
    const received: unknown[] = [];
    const importer = createNativeJsonFileImporter((port) => {
      closed = new Promise((resolve) =>
        (port as unknown as import('node:worker_threads').MessagePort).once('close', resolve)
      );
      port.onmessage = (event) => received.push(event.data);
      port.postMessage(metadata);
    });
    expect(await importer.openJsonFile(() => importer.cancelJsonFileImport('a'), 'a')).toBeNull();
    await closed;
    expect(received).toEqual([]);
  });
  it('releases buffered chunks and closes the file channel on cancellation', async () => {
    vi.stubGlobal('MessageChannel', MessageChannel);
    const release = vi.spyOn(NativeJsonFileBuffer.prototype, 'release');
    let closed: Promise<void> | undefined;
    const importer = createNativeJsonFileImporter((port) => {
      closed = new Promise((resolve) =>
        (port as unknown as import('node:worker_threads').MessagePort).once('close', resolve)
      );
      port.onmessage = (event) => {
        if (event.data.type === 'selected-ack')
          port.postMessage({ type: 'chunk', chunk: new TextEncoder().encode('{"partial":') });
        else if (event.data.type === 'chunk-ack') importer.cancelJsonFileImport('a');
      };
      port.postMessage(metadata);
    });
    expect(await importer.openJsonFile(undefined, 'a')).toBeNull();
    await closed;
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('completes a normal native read and tolerates cancellation after completion', async () => {
    vi.stubGlobal('MessageChannel', MessageChannel);
    const importer = createNativeJsonFileImporter((port) => {
      port.onmessage = (event) => {
        if (event.data.type === 'selected-ack')
          port.postMessage({ type: 'chunk', chunk: new TextEncoder().encode('{"value":"你好"}') });
        else if (event.data.type === 'chunk-ack') port.postMessage({ type: 'complete' });
      };
      port.postMessage(metadata);
    });
    const result = await importer.openJsonFile();
    expect(result?.content).toBe('{"value":"你好"}');
    expect(new TextDecoder().decode(result?.contentBuffer)).toBe(result?.content);
    importer.cancelJsonFileImport('missing');
  });
  it.each(['error', 'cancelled', 'chunk', 'complete'])(
    'settles an early %s message without leaking the port',
    async (type) => {
      vi.stubGlobal('MessageChannel', MessageChannel);
      const importer = createNativeJsonFileImporter((port) =>
        port.postMessage({ type, message: 'read failed', chunk: new Uint8Array(1) })
      );
      const result = importer.openJsonFile();
      if (type === 'cancelled') await expect(result).resolves.toBeNull();
      else await expect(result).rejects.toThrow();
    }
  );
  it('rejects failures opening the main-process channel', async () => {
    vi.stubGlobal('MessageChannel', MessageChannel);
    const importer = createNativeJsonFileImporter(() => {
      throw new Error('channel failed');
    });
    await expect(importer.openJsonFile()).rejects.toThrow('channel failed');
  });
});
