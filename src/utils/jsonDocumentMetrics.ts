import {
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

export function shouldUseLargeMode(rawText: string, formattedText = '') {
  return isLargeDocument(rawText) || isLargeDocument(formattedText);
}

export function canUseStructureSync(text: string) {
  const byteLength = getUtf8ByteLength(text);
  return byteLength >= LARGE_FILE_THRESHOLD && byteLength <= STRUCTURE_SYNC_THRESHOLD;
}

export function shouldBuildWorkerStructure(text: string, largeFileLocateEnabled: boolean) {
  const byteLength = getUtf8ByteLength(text);

  if (byteLength === 0) {
    return false;
  }

  if (byteLength < LARGE_FILE_THRESHOLD) {
    return true;
  }

  return byteLength <= STRUCTURE_SYNC_THRESHOLD && largeFileLocateEnabled;
}
