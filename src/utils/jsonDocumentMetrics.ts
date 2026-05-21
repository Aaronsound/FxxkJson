import {
  DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD,
  DEDICATED_RIGHT_VIEWER_THRESHOLD,
  LARGE_FILE_THRESHOLD,
  STRUCTURE_SYNC_THRESHOLD,
} from '../types/jsonTool';

const utf8Encoder = new TextEncoder();

export function getUtf8ByteLength(text: string) {
  return utf8Encoder.encode(text).length;
}

export function isLargeDocument(text: string) {
  return getUtf8ByteLength(text) >= LARGE_FILE_THRESHOLD;
}

export function exceedsLineCountThreshold(text: string, threshold = DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD) {
  if (threshold <= 0) {
    return text.length > 0;
  }

  let lineCount = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      lineCount += 1;
      if (lineCount > threshold) {
        return true;
      }
    }
  }

  return false;
}

export function shouldUseDedicatedRightViewer(rawText: string, formattedText = '') {
  return (
    getUtf8ByteLength(rawText) >= DEDICATED_RIGHT_VIEWER_THRESHOLD ||
    getUtf8ByteLength(formattedText) >= DEDICATED_RIGHT_VIEWER_THRESHOLD ||
    exceedsLineCountThreshold(formattedText)
  );
}

export function shouldUseLargeMode(rawText: string, formattedText = '') {
  return isLargeDocument(rawText) || isLargeDocument(formattedText) || exceedsLineCountThreshold(formattedText);
}

export function canUseStructureSync(text: string) {
  const byteLength = getUtf8ByteLength(text);
  return byteLength >= LARGE_FILE_THRESHOLD && byteLength <= STRUCTURE_SYNC_THRESHOLD;
}

export function shouldBuildWorkerStructure(text: string, largeFileLocateEnabled: boolean) {
  const byteLength = getUtf8ByteLength(text);
  return byteLength > 0 && byteLength <= STRUCTURE_SYNC_THRESHOLD && largeFileLocateEnabled;
}
