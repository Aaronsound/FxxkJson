import type { LargeRawViewerData } from '../types/jsonTool';

export const RAW_VIEWER_CHUNK_SIZE = 2000;
const MAX_RAW_VIEWER_CHUNK_SIZE = 0xffff;
const INITIAL_RAW_VIEWER_ROW_CAPACITY = 1024;

function getInitialRawViewerRowCapacity(textLength: number, chunkSize: number) {
  return Math.max(INITIAL_RAW_VIEWER_ROW_CAPACITY, Math.ceil(textLength / chunkSize));
}

function createRawViewerBuffers(capacity: number) {
  const startsByteLength = capacity * Uint32Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(startsByteLength + capacity * Uint16Array.BYTES_PER_ELEMENT);
  return {
    lengths: new Uint16Array(buffer, startsByteLength, capacity),
    starts: new Uint32Array(buffer, 0, capacity),
  };
}

function growRawViewerBuffers(starts: Uint32Array, lengths: Uint16Array, minimumCapacity: number) {
  let capacity = Math.max(1, starts.length);
  while (capacity < minimumCapacity) {
    capacity *= 2;
  }

  const next = createRawViewerBuffers(capacity);
  next.starts.set(starts);
  next.lengths.set(lengths);
  return next;
}

function createRawViewerDataBuilder(textLength: number, chunkSize: number) {
  const initialCapacity = getInitialRawViewerRowCapacity(textLength, chunkSize);
  let { lengths, starts } = createRawViewerBuffers(initialCapacity);
  let rowCount = 0;

  const appendRow = (start: number, end: number) => {
    if (rowCount === starts.length) {
      ({ lengths, starts } = growRawViewerBuffers(starts, lengths, rowCount + 1));
    }
    starts[rowCount] = start;
    lengths[rowCount] = end - start;
    rowCount += 1;
  };

  return {
    appendLine(start: number, end: number) {
      if (start === end) {
        appendRow(start, end);
        return;
      }

      let segmentStart = start;
      while (segmentStart < end) {
        const segmentEnd = Math.min(end, segmentStart + chunkSize);
        appendRow(segmentStart, segmentEnd);
        segmentStart = segmentEnd;
      }
    },
    finish(): LargeRawViewerData {
      if (starts.length === rowCount) {
        return { lengths, rowCount, starts };
      }

      const compact = createRawViewerBuffers(rowCount);
      compact.starts.set(starts.subarray(0, rowCount));
      compact.lengths.set(lengths.subarray(0, rowCount));
      return {
        lengths: compact.lengths,
        rowCount,
        starts: compact.starts,
      };
    },
  };
}

export function buildLargeRawViewerData(text: string, chunkSize = RAW_VIEWER_CHUNK_SIZE): LargeRawViewerData {
  const safeChunkSize = Math.max(1, Math.min(MAX_RAW_VIEWER_CHUNK_SIZE, Math.floor(chunkSize) || 1));
  const builder = createRawViewerDataBuilder(text.length, safeChunkSize);
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;

    builder.appendLine(lineStart, lineEnd);

    if (newlineIndex === -1) {
      break;
    }

    lineStart = newlineIndex + 1;
    if (lineStart === text.length) {
      builder.appendLine(lineStart, lineStart);
      break;
    }
  }

  return builder.finish();
}

export function getRawSegmentEnd(data: LargeRawViewerData, index: number) {
  const start = data.starts[index] ?? 0;
  return start + (data.lengths[index] ?? 0);
}

export function findRawSegmentIndex(data: LargeRawViewerData, offset: number) {
  let low = 0;
  let high = data.starts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = data.starts[mid];

    if (value <= offset) {
      result = mid;
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  if (offset > getRawSegmentEnd(data, result) && result < data.starts.length - 1) {
    return result + 1;
  }

  return result;
}
