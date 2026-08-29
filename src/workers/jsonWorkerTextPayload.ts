import type {
  JsonTextPatch,
  LargeJsonLineIndex,
  LargeJsonViewerData,
  LargeRawViewerData,
  WorkerMessage,
} from '../types/jsonTool';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { getUtf8ByteLength } from '../utils/jsonDocumentMetrics';

type TextPayloadMessage = { text?: string; textBuffer?: ArrayBuffer };
type NamedTextPayloadMessage = Record<string, unknown>;
type MutableWorkerTextMessage = Record<string, unknown>;
type WorkerPostMessageScope = {
  postMessage(message: unknown, transfer: Transferable[]): void;
};

export interface PreparedWorkerText {
  buffer: ArrayBuffer | null;
  byteLength: number;
  text: string;
}

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

export function prepareWorkerText(text: string): PreparedWorkerText {
  const bytes = getTextEncoder().encode(text);
  return {
    buffer: bytes.byteLength >= LARGE_FILE_THRESHOLD ? bytes.buffer : null,
    byteLength: bytes.byteLength,
    text,
  };
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

export function readNamedMessageText(
  message: NamedTextPayloadMessage,
  stringKey: string,
  bufferKey: string
): string | undefined {
  const text = message[stringKey];
  if (typeof text === 'string') {
    return text;
  }

  const buffer = message[bufferKey];
  if (buffer && typeof buffer === 'object' && 'byteLength' in buffer && typeof buffer.byteLength === 'number') {
    return getTextDecoder().decode(new Uint8Array(buffer as ArrayBuffer));
  }

  return undefined;
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

  const buffers = [
    rawViewerData.starts.buffer,
    rawViewerData.lineNumbers.buffer,
    rawViewerData.lengths.buffer,
    rawViewerData.syntaxStates.buffer,
  ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
  return Array.from(new Set(buffers));
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
    literalChunks: viewerData.literalChunks,
  };
}

export function postTextResult(payload: Partial<WorkerMessage>, text: string, byteLength?: number) {
  const message = { ...payload };
  const transfer: Transferable[] = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', text, byteLength);
  transfer.push(...getRawViewerTransferables(payload.rawViewerData));
  transfer.push(...getLargeViewerTransferables(payload.viewerData));
  (self as unknown as WorkerPostMessageScope).postMessage(message, transfer);
}

export function postPreparedTextResult(payload: Partial<WorkerMessage>, prepared: PreparedWorkerText) {
  const message = { ...payload };
  const transfer: Transferable[] = [];

  if (prepared.buffer) {
    message.dataBuffer = prepared.buffer;
    transfer.push(prepared.buffer);
  } else {
    message.data = prepared.text;
  }

  transfer.push(...getRawViewerTransferables(payload.rawViewerData));
  transfer.push(...getLargeViewerTransferables(payload.viewerData));
  (self as unknown as WorkerPostMessageScope).postMessage(message, transfer);
}

export function postPreparedRepairResult(
  payload: Partial<WorkerMessage>,
  formatted: PreparedWorkerText,
  repaired: PreparedWorkerText
) {
  const message = { ...payload };
  const transfer: Transferable[] = [];

  if (formatted.buffer) {
    message.dataBuffer = formatted.buffer;
    transfer.push(formatted.buffer);
  } else {
    message.data = formatted.text;
  }

  if (repaired.buffer) {
    message.repairedTextBuffer = repaired.buffer;
    transfer.push(repaired.buffer);
  } else {
    message.repairedText = repaired.text;
  }

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

export function postNodePatchResult(
  payload: Partial<WorkerMessage>,
  rawPatch: JsonTextPatch,
  formattedPatch: JsonTextPatch | null
) {
  const message = {
    ...payload,
    rawPatch,
    formattedPatch: formattedPatch ?? undefined,
  };
  const transfer = [
    ...getRawViewerTransferables(payload.rawViewerData),
    ...getLargeViewerTransferables(payload.viewerData),
  ];
  (self as unknown as WorkerPostMessageScope).postMessage(message, transfer);
}
