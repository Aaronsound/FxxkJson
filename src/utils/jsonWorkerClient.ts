import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type {
  WorkerMessage,
  WorkerRequestMessage,
  WorkerRequestTextPayload,
} from '../types/jsonTool';
import { getUtf8ByteLength } from './jsonDocumentMetrics';

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
    || Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

export function createJsonWorkerClient(getWorker: () => Worker | null) {
  let textEncoder: TextEncoder | null = null;
  let textDecoder: TextDecoder | null = null;

  const getTextEncoder = () => {
    textEncoder ??= new TextEncoder();
    return textEncoder;
  };

  const getTextDecoder = () => {
    textDecoder ??= new TextDecoder();
    return textDecoder;
  };

  const postRequest = (
    message: WorkerRequestMessage,
    transfer: Transferable[] = []
  ) => {
    getWorker()?.postMessage(message, transfer);
  };

  const createTextPayload = (
    text: string,
    byteLength = getUtf8ByteLength(text)
  ): { message: WorkerRequestTextPayload; transfer: Transferable[] } => {
    if (byteLength < LARGE_FILE_THRESHOLD) {
      return {
        message: { text },
        transfer: [],
      };
    }

    const bytes = getTextEncoder().encode(text);
    const buffer = bytes.buffer as ArrayBuffer;
    return {
      message: { textBuffer: buffer },
      transfer: [buffer],
    };
  };

  const readTextField = (
    message: WorkerMessage,
    stringKey: 'data' | 'repairedText',
    bufferKey: 'dataBuffer' | 'repairedTextBuffer'
  ) => {
    if (typeof message[stringKey] === 'string') {
      return message[stringKey];
    }

    if (isArrayBuffer(message[bufferKey])) {
      return getTextDecoder().decode(new Uint8Array(message[bufferKey]));
    }

    return null;
  };

  const readText = (message: WorkerMessage) => (
    readTextField(message, 'data', 'dataBuffer')
  );

  return {
    createTextPayload,
    postRequest,
    readText,
    readTextField,
  };
}
