import type { JsonTextPatch, LargeJsonLineIndex, LargeJsonViewerData } from '../types/jsonTool';

export const MAX_INLINE_JSON_TEXT_PATCH_LENGTH = 256 * 1024;

export function createJsonTextPatch(source: string, updated: string): JsonTextPatch {
  const maximumPrefixLength = Math.min(source.length, updated.length);
  let startOffset = 0;
  while (startOffset < maximumPrefixLength && source.charCodeAt(startOffset) === updated.charCodeAt(startOffset)) {
    startOffset += 1;
  }

  let sourceEndOffset = source.length;
  let updatedEndOffset = updated.length;
  while (
    sourceEndOffset > startOffset &&
    updatedEndOffset > startOffset &&
    source.charCodeAt(sourceEndOffset - 1) === updated.charCodeAt(updatedEndOffset - 1)
  ) {
    sourceEndOffset -= 1;
    updatedEndOffset -= 1;
  }

  return {
    sourceLength: source.length,
    startOffset,
    endOffset: sourceEndOffset,
    text: updated.slice(startOffset, updatedEndOffset),
  };
}

export function applyJsonTextPatch(source: string, patch: JsonTextPatch | null | undefined) {
  if (
    !patch ||
    patch.sourceLength !== source.length ||
    !Number.isSafeInteger(patch.startOffset) ||
    !Number.isSafeInteger(patch.endOffset) ||
    patch.startOffset < 0 ||
    patch.endOffset < patch.startOffset ||
    patch.endOffset > source.length ||
    typeof patch.text !== 'string'
  ) {
    return null;
  }

  return `${source.slice(0, patch.startOffset)}${patch.text}${source.slice(patch.endOffset)}`;
}

export function canInlineJsonTextPatch(patch: JsonTextPatch | null | undefined) {
  return Boolean(patch && patch.text.length <= MAX_INLINE_JSON_TEXT_PATCH_LENGTH);
}

export function patchLargeJsonLineIndex<T extends LargeJsonLineIndex>(data: T, patch: JsonTextPatch): T {
  const lineStarts = data.lineStarts.slice();
  const offsetDelta = patch.text.length - (patch.endOffset - patch.startOffset);
  if (offsetDelta === 0) {
    return { ...data, lineStarts };
  }

  const firstShiftedOffset = patch.startOffset === patch.endOffset ? patch.endOffset + 1 : patch.endOffset;
  let low = 0;
  let high = lineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] < firstShiftedOffset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  for (let index = low; index < lineStarts.length; index += 1) {
    lineStarts[index] += offsetDelta;
  }

  return { ...data, lineStarts };
}

export function patchLargeJsonViewerData(data: LargeJsonViewerData, patch: JsonTextPatch) {
  return patchLargeJsonLineIndex(data, patch);
}
