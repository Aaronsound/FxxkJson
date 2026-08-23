import type { LargeRawViewerData } from '../types/jsonTool';

export const RAW_VIEWER_CHUNK_SIZE = 2000;
const MAX_RAW_VIEWER_CHUNK_SIZE = 0xffff;
const INITIAL_RAW_VIEWER_ROW_CAPACITY = 1024;

function growRawViewerStarts(buffer: Uint32Array, minimumCapacity: number) {
  let capacity = Math.max(1, buffer.length);
  while (capacity < minimumCapacity) {
    capacity *= 2;
  }

  const next = new Uint32Array(capacity);
  next.set(buffer);
  return next;
}

function growRawViewerLengths(buffer: Uint16Array, minimumCapacity: number) {
  let capacity = Math.max(1, buffer.length);
  while (capacity < minimumCapacity) {
    capacity *= 2;
  }

  const next = new Uint16Array(capacity);
  next.set(buffer);
  return next;
}

export function buildLargeRawViewerData(text: string, chunkSize = RAW_VIEWER_CHUNK_SIZE): LargeRawViewerData {
  if (!text) {
    return {
      starts: Uint32Array.from([0]),
      lengths: Uint16Array.from([0]),
      rowCount: 1,
    };
  }

  const safeChunkSize = Math.max(1, Math.min(MAX_RAW_VIEWER_CHUNK_SIZE, Math.floor(chunkSize) || 1));
  let starts = new Uint32Array(INITIAL_RAW_VIEWER_ROW_CAPACITY);
  let lengths = new Uint16Array(INITIAL_RAW_VIEWER_ROW_CAPACITY);
  let rowCount = 0;
  let lineStart = 0;

  const appendRow = (start: number, end: number) => {
    if (rowCount === starts.length) {
      starts = growRawViewerStarts(starts, rowCount + 1);
      lengths = growRawViewerLengths(lengths, rowCount + 1);
    }
    starts[rowCount] = start;
    lengths[rowCount] = end - start;
    rowCount += 1;
  };

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;

    if (lineStart === lineEnd) {
      appendRow(lineStart, lineEnd);
    } else {
      let segmentStart = lineStart;
      while (segmentStart < lineEnd) {
        const segmentEnd = Math.min(lineEnd, segmentStart + safeChunkSize);
        appendRow(segmentStart, segmentEnd);
        segmentStart = segmentEnd;
      }
    }

    if (newlineIndex === -1) {
      break;
    }

    lineStart = newlineIndex + 1;
    if (lineStart === text.length) {
      appendRow(lineStart, lineStart);
      break;
    }
  }

  return {
    starts: starts.slice(0, rowCount),
    lengths: lengths.slice(0, rowCount),
    rowCount,
  };
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
