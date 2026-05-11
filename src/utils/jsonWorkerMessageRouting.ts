import type { WorkerRequestMessage } from '../types/jsonTool';

export type JsonWorkerMessageHandler = (message: WorkerRequestMessage) => void;
export type JsonWorkerMessageHandlerMap = Partial<Record<WorkerRequestMessage['type'], JsonWorkerMessageHandler>>;

export function getJsonWorkerMessageHandler(
  handlers: JsonWorkerMessageHandlerMap,
  message: WorkerRequestMessage
) {
  return handlers[message.type] ?? null;
}
