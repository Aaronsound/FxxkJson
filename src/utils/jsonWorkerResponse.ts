import type { WorkerMessage } from '../types/jsonTool';

type ReadWorkerText = (message: WorkerMessage) => string | null;
type ReadWorkerTextField = (
  message: WorkerMessage,
  stringKey: 'data' | 'repairedText',
  bufferKey: 'dataBuffer' | 'repairedTextBuffer'
) => string | null;

export function getFormatWorkerResult(
  message: WorkerMessage,
  readText: ReadWorkerText
) {
  const formattedText = readText(message);
  return {
    error: message.error ?? null,
    formattedText,
    isSuccessful: Boolean(message.success && formattedText),
    rawViewerData: message.rawViewerData ?? null,
  };
}

export function getRepairWorkerResult(
  message: WorkerMessage,
  readText: ReadWorkerText,
  readTextField: ReadWorkerTextField
) {
  const formattedText = readText(message);
  const repairedText = readTextField(message, 'repairedText', 'repairedTextBuffer');
  return {
    error: message.error ?? null,
    formattedText,
    isSuccessful: Boolean(
      message.success
      && typeof formattedText === 'string'
      && typeof repairedText === 'string'
    ),
    rawViewerData: message.rawViewerData ?? null,
    repairedText,
  };
}
