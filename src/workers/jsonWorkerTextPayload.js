import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';

let textDecoder = null;
let textEncoder = null;

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

export function getTextByteLength(text) {
  return getTextEncoder().encode(text).length;
}

export function readMessageText(message) {
  if (typeof message.text === 'string') {
    return message.text;
  }

  if (message.textBuffer && typeof message.textBuffer.byteLength === 'number') {
    return getTextDecoder().decode(new Uint8Array(message.textBuffer));
  }

  return '';
}

export function appendTextPayload(message, transfer, stringKey, bufferKey, text) {
  if (typeof text === 'string' && text.length >= LARGE_FILE_THRESHOLD) {
    const bytes = getTextEncoder().encode(text);
    const buffer = bytes.buffer;
    message[bufferKey] = buffer;
    transfer.push(buffer);
    return;
  }

  message[stringKey] = text;
}

export function postTextResult(payload, text) {
  const message = { ...payload };
  const transfer = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', text);
  postMessage(message, transfer);
}

export function postRepairResult(payload, formattedText, repairedText) {
  const message = { ...payload };
  const transfer = [];
  appendTextPayload(message, transfer, 'data', 'dataBuffer', formattedText);
  appendTextPayload(message, transfer, 'repairedText', 'repairedTextBuffer', repairedText);
  postMessage(message, transfer);
}
