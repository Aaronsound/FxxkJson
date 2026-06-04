import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type { WorkerMessage } from '../types/jsonTool';

type TextPayloadMessage = { text?: string; textBuffer?: ArrayBuffer };
type MutableWorkerTextMessage = Record<string, unknown>;
type WorkerPostMessageScope = {
  postMessage(message: unknown, transfer: Transferable[]): void;
};

let textDecoder: TextDecoder | null = null;
let textEncoder: TextEncoder | null = null;

export function getTextDecoder() {
  if (!textDecoder) {
    textDecoder = new TextDecoder();
  }

  return textDecoder;
}

export function getTextEncoder() {
  if (!textEncoder) {
    textEncoder = new TextEncoder();
  }

  return textEncoder;
}

export function getTextByteLength(text: string) {
  return getTextEncoder().encode(text).length;
}

export function readMessageText(message: TextPayloadMessage) {
  if (typeof message.text === 'string') {
    return message.text;
  }

  if (message.textBuffer && typeof message.textBuffer.byteLength === 'number') {
    return getTextDecoder().decode(new Uint8Array(message.textBuffer));
  }

  return '';
}

export function appendTextPayload(
  message: MutableWorkerTextMessage,
  transfer: Transferable[],
  stringKey: string,
  bufferKey: string,
  text: string
) {
  if (text.length >= LARGE_FILE_THRESHOLD) {
    const bytes = getTextEncoder().encode(text);
    const buffer = bytes.buffer;
    message[bufferKey] = buffer;
    transfer.push(buffer);
    return;
  }

  message[stringKey] = text;
}

export function postTextResult(payload: Partial<WorkerMessage>, text: string) {
  const message = { ...payload };
  const transfer: Transferable[] = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', text);
  (self as unknown as WorkerPostMessageScope).postMessage(message, transfer);
}

export function postRepairResult(payload: Partial<WorkerMessage>, formattedText: string, repairedText: string) {
  const message = { ...payload };
  const transfer: Transferable[] = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', formattedText);
  appendTextPayload(message, transfer, 'repairedText', 'repairedTextBuffer', repairedText);
  (self as unknown as WorkerPostMessageScope).postMessage(message, transfer);
}
