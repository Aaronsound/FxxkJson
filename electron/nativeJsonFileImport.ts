import { NativeJsonFileBuffer } from './nativeJsonFileBuffer';

interface Metadata {
  path: string;
  name: string;
  size: number;
}
type StreamMessage =
  | ({ type: 'selected' } & Metadata)
  | { type: 'chunk'; chunk: Uint8Array }
  | { type: 'complete' }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export function createNativeJsonFileImporter(openPort: (port: MessagePort) => void) {
  const pending = new Map<string, () => void>();
  let sequence = 0;
  const cancelJsonFileImport = (id: string) => pending.get(id)?.();
  const openJsonFile = (onSelected?: (metadata: Metadata) => void, requestId = `native-${++sequence}`) => {
    cancelJsonFileImport(requestId);
    return new Promise<(Metadata & { content: string; contentBuffer: ArrayBuffer }) | null>((resolve, reject) => {
      const channel = new MessageChannel();
      let fileBuffer: NativeJsonFileBuffer | null = null;
      let metadata: Metadata | null = null;
      let settled = false;
      let ackTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        settled = true;
        if (ackTimer !== undefined) clearTimeout(ackTimer);
        fileBuffer?.release();
        fileBuffer = null;
        pending.delete(requestId);
        channel.port1.onmessage = null;
        channel.port1.onmessageerror = null;
        channel.port1.close();
      };
      const fail = (error: unknown) => {
        if (settled) return;
        finish();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      pending.set(requestId, () => {
        if (!settled) {
          finish();
          resolve(null);
        }
      });
      channel.port1.onmessage = (event: MessageEvent<StreamMessage>) => {
        if (settled) return;
        try {
          const message = event.data;
          if (message.type === 'selected') {
            metadata = { name: message.name, path: message.path, size: message.size };
            onSelected?.(metadata);
            if (settled) return;
            fileBuffer = new NativeJsonFileBuffer(message.size);
            // Yield so the renderer can paint before the main process starts reading.
            ackTimer = setTimeout(() => {
              if (!settled) channel.port1.postMessage({ type: 'selected-ack' });
            }, 0);
          } else if (message.type === 'chunk') {
            if (!fileBuffer) throw new Error('JSON file metadata was not received before its content');
            fileBuffer.append(message.chunk);
            channel.port1.postMessage({ type: 'chunk-ack' });
          } else if (message.type === 'cancelled') {
            finish();
            resolve(null);
          } else if (message.type === 'error') fail(new Error(message.message));
          else {
            if (!metadata || !fileBuffer) throw new Error('JSON file metadata was not received');
            const { buffer: contentBuffer, text: content } = fileBuffer.finish();
            finish();
            resolve({ ...metadata, content, contentBuffer });
          }
        } catch (error) {
          fail(error);
        }
      };
      channel.port1.onmessageerror = () => fail(new Error('Unable to read JSON file stream'));
      channel.port1.start();
      try {
        openPort(channel.port2);
      } catch (error) {
        channel.port2.close();
        fail(error);
      }
    });
  };
  return { openJsonFile, cancelJsonFileImport };
}
