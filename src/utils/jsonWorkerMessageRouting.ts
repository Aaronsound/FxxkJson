import type { WorkerMessage, WorkerRequestMessage } from '../types/jsonTool';

export type JsonWorkerMessageHandler = (message: WorkerRequestMessage) => void;
export type JsonWorkerMessageHandlerMap = Partial<Record<WorkerRequestMessage['type'], JsonWorkerMessageHandler>>;
export type JsonWorkerResultHandler = (message: WorkerMessage) => void;
export type JsonWorkerResultHandlerMap = Partial<Record<WorkerMessage['type'], JsonWorkerResultHandler>>;

export function getJsonWorkerMessageHandler(handlers: JsonWorkerMessageHandlerMap, message: WorkerRequestMessage) {
  return handlers[message.type] ?? null;
}

export function getJsonWorkerResultHandler(handlers: JsonWorkerResultHandlerMap, message: WorkerMessage) {
  return handlers[message.type] ?? null;
}
