import type { LargeJsonLineIndex, LargeJsonViewerData, LargeRawViewerData, WorkerMessage } from '../types/jsonTool';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { getUtf8ByteLength } from '../utils/jsonDocumentMetrics';

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
  return getUtf8ByteLength(text);
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
  text: string,
  knownByteLength?: number
) {
  if ((knownByteLength ?? getTextByteLength(text)) >= LARGE_FILE_THRESHOLD) {
    const bytes = getTextEncoder().encode(text);
    const buffer = bytes.buffer;
    message[bufferKey] = buffer;
    transfer.push(buffer);
    return;
  }

  message[stringKey] = text;
}

export function getRawViewerTransferables(rawViewerData: LargeRawViewerData | null | undefined) {
  if (!rawViewerData) {
    return [];
  }

  return [rawViewerData.starts.buffer, rawViewerData.lengths.buffer].filter(
    (buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer
  );
}

export function getLargeViewerTransferables(viewerData: LargeJsonViewerData | null | undefined) {
  if (!viewerData) {
    return [];
  }

  const buffers = [
    viewerData.lineStarts.buffer,
    viewerData.regions.startLines.buffer,
    viewerData.regions.endLines.buffer,
    viewerData.regions.parentIndexes.buffer,
    viewerData.regions.kinds.buffer,
  ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);

  return Array.from(new Set(buffers));
}

export function copyLargeViewerLineIndex(viewerData: LargeJsonViewerData): LargeJsonLineIndex {
  return {
    lineStarts: viewerData.lineStarts.slice(),
    lineCount: viewerData.lineCount,
  };
}

export function postTextResult(payload: Partial<WorkerMessage>, text: string, byteLength?: number) {
  const message = { ...payload };
  const transfer: Transferable[] = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', text, byteLength);
  transfer.push(...getRawViewerTransferables(payload.rawViewerData));
  (self as unknown as WorkerPostMessageScope).postMessage(message, transfer);
}

export function postRepairResult(
  payload: Partial<WorkerMessage>,
  formattedText: string,
  repairedText: string,
  formattedByteLength?: number,
  repairedByteLength?: number
) {
  const message = { ...payload };
  const transfer: Transferable[] = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', formattedText, formattedByteLength);
  appendTextPayload(message, transfer, 'repairedText', 'repairedTextBuffer', repairedText, repairedByteLength);
  transfer.push(...getRawViewerTransferables(payload.rawViewerData));
  (self as unknown as WorkerPostMessageScope).postMessage(message, transfer);
}

export function postNodeSaveResult(
  payload: Partial<WorkerMessage>,
  rawText: string,
  formattedText: string | null,
  rawByteLength?: number,
  formattedByteLength?: number
) {
  const message = { ...payload };
  const transfer: Transferable[] = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', rawText, rawByteLength);
  if (typeof formattedText === 'string') {
    appendTextPayload(message, transfer, 'formattedText', 'formattedTextBuffer', formattedText, formattedByteLength);
  }
  transfer.push(...getRawViewerTransferables(payload.rawViewerData));
  transfer.push(...getLargeViewerTransferables(payload.viewerData));
  (self as unknown as WorkerPostMessageScope).postMessage(message, transfer);
}
