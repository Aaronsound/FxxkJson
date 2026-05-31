import type { WorkerMessage } from '../types/jsonTool';

type TextPayloadMessage = { text?: string; textBuffer?: ArrayBuffer };
type MutableWorkerTextMessage = Record<string, unknown>;

export function appendTextPayload(
  message: MutableWorkerTextMessage,
  transfer: Transferable[],
  stringKey: string,
  bufferKey: string,
  text: string
): void;
export function getTextByteLength(text: string): number;
export function getTextDecoder(): TextDecoder;
export function getTextEncoder(): TextEncoder;
export function postRepairResult(payload: Partial<WorkerMessage>, formattedText: string, repairedText: string): void;
export function postTextResult(payload: Partial<WorkerMessage>, text: string): void;
export function readMessageText(message: TextPayloadMessage): string;
