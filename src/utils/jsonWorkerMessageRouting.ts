import type { WorkerMessage, WorkerRequestMessage } from '../types/jsonTool';

export type JsonWorkerMessageHandler = (message: WorkerRequestMessage) => void;
export type JsonWorkerMessageHandlerMap = Partial<Record<WorkerRequestMessage['type'], JsonWorkerMessageHandler>>;
export type JsonWorkerResultHandler = (message: WorkerMessage) => void;
export type JsonWorkerResultHandlerMap = Partial<Record<WorkerMessage['type'], JsonWorkerResultHandler>>;

const JSON_WORKER_REQUEST_TYPES = new Set<WorkerRequestMessage['type']>([
  'clear-structure',
  'edit-json',
  'format',
  'locate',
  'locate-right-direct',
  'repair',
  'search',
]);

export function isJsonWorkerRequestMessage(value: unknown): value is WorkerRequestMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Partial<WorkerRequestMessage>;
  if (
    typeof message.type !== 'string' ||
    !JSON_WORKER_REQUEST_TYPES.has(message.type) ||
    typeof message.tabId !== 'string'
  ) {
    return false;
  }

  return message.type === 'clear-structure' || typeof (message as { requestId?: unknown }).requestId === 'number';
}

export function getJsonWorkerMessageHandler(handlers: JsonWorkerMessageHandlerMap, message: WorkerRequestMessage) {
  return handlers[message.type] ?? null;
}

export function getJsonWorkerResultHandler(handlers: JsonWorkerResultHandlerMap, message: WorkerMessage) {
  return handlers[message.type] ?? null;
}
