import {
  DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD,
  DEDICATED_RIGHT_VIEWER_THRESHOLD,
  LARGE_FILE_THRESHOLD,
  STRUCTURE_SYNC_THRESHOLD,
} from '../types/jsonTool';

export interface JsonDocumentMetrics {
  exceedsDedicatedViewerLineThreshold: boolean;
  textByteLength: number;
}

export function measureJsonDocument(
  text: string,
  lineThreshold = DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD
): JsonDocumentMetrics {
  let byteLength = 0;
  let lineCount = 1;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);

    if (code <= 0x7f) {
      byteLength += 1;
    } else if (code <= 0x7ff) {
      byteLength += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = text.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else {
        byteLength += 3;
      }
    } else {
      byteLength += 3;
    }

    if (code === 0x0a) {
      lineCount += 1;
    }
  }

  return {
    exceedsDedicatedViewerLineThreshold: lineThreshold <= 0 ? text.length > 0 : lineCount > lineThreshold,
    textByteLength: byteLength,
  };
}

export function getUtf8ByteLength(text: string) {
  return measureJsonDocument(text).textByteLength;
}

export function isLargeDocument(text: string) {
  return getUtf8ByteLength(text) >= LARGE_FILE_THRESHOLD;
}

export function exceedsLineCountThreshold(text: string, threshold = DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD) {
  return measureJsonDocument(text, threshold).exceedsDedicatedViewerLineThreshold;
}

export function shouldUseLargeModeForMetrics(metrics: JsonDocumentMetrics) {
  return metrics.textByteLength >= LARGE_FILE_THRESHOLD || metrics.exceedsDedicatedViewerLineThreshold;
}

export function shouldUseDedicatedRightViewer(rawText: string, formattedText = '') {
  return shouldUseDedicatedRightViewerForMetrics(measureJsonDocument(rawText), measureJsonDocument(formattedText));
}

export function shouldUseDedicatedRightViewerForMetrics(
  rawMetrics: JsonDocumentMetrics,
  formattedMetrics: JsonDocumentMetrics
) {
  return (
    rawMetrics.textByteLength >= DEDICATED_RIGHT_VIEWER_THRESHOLD ||
    formattedMetrics.textByteLength >= DEDICATED_RIGHT_VIEWER_THRESHOLD ||
    formattedMetrics.exceedsDedicatedViewerLineThreshold
  );
}

export function shouldUseLargeMode(rawText: string, formattedText = '') {
  const rawMetrics = measureJsonDocument(rawText);
  const formattedMetrics = measureJsonDocument(formattedText);
  return shouldUseLargeModeForMetrics(rawMetrics) || shouldUseLargeModeForMetrics(formattedMetrics);
}

export function canUseStructureSync(text: string) {
  const byteLength = getUtf8ByteLength(text);
  return byteLength >= LARGE_FILE_THRESHOLD && byteLength <= STRUCTURE_SYNC_THRESHOLD;
}

export function shouldBuildWorkerStructure(text: string, largeFileLocateEnabled: boolean) {
  const byteLength = getUtf8ByteLength(text);
  return byteLength > 0 && byteLength <= STRUCTURE_SYNC_THRESHOLD && largeFileLocateEnabled;
}
