import {
  DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD,
  DEDICATED_RIGHT_VIEWER_THRESHOLD,
  LARGE_FILE_THRESHOLD,
  STRUCTURE_SYNC_THRESHOLD,
} from '../types/jsonTool';

export function getUtf8ByteLength(text: string) {
  let byteLength = 0;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);

    if (code <= 0x7f) {
      byteLength += 1;
      continue;
    }

    if (code <= 0x7ff) {
      byteLength += 2;
      continue;
    }

    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = text.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else {
        byteLength += 3;
      }
      continue;
    }

    byteLength += 3;
  }

  return byteLength;
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
