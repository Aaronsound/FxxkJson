import type { LargeRawViewerData } from '../types/jsonTool';

export const RAW_VIEWER_CHUNK_SIZE = 2000;

export function buildLargeRawViewerData(text: string, chunkSize = RAW_VIEWER_CHUNK_SIZE): LargeRawViewerData {
  if (!text) {
    return {
      starts: Uint32Array.from([0]),
      ends: Uint32Array.from([0]),
      rowCount: 1,
    };
  }

  const starts: number[] = [];
  const ends: number[] = [];
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;

    if (lineStart === lineEnd) {
      starts.push(lineStart);
      ends.push(lineEnd);
    } else {
      let segmentStart = lineStart;
      while (segmentStart < lineEnd) {
        const segmentEnd = Math.min(lineEnd, segmentStart + chunkSize);
        starts.push(segmentStart);
        ends.push(segmentEnd);
        segmentStart = segmentEnd;
      }
    }

    if (newlineIndex === -1) {
      break;
    }

    lineStart = newlineIndex + 1;
    if (lineStart === text.length) {
      starts.push(lineStart);
      ends.push(lineStart);
      break;
    }
  }

  return {
    starts: Uint32Array.from(starts),
    ends: Uint32Array.from(ends),
    rowCount: starts.length,
  };
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

  if (offset > (data.ends[result] ?? 0) && result < data.starts.length - 1) {
    return result + 1;
  }

  return result;
}
