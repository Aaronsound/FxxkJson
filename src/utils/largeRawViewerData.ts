import type { LargeRawViewerData } from '../types/jsonTool';

export const RAW_VIEWER_CHUNK_SIZE = 2000;
export const RAW_SYNTAX_IN_STRING = 1;
export const RAW_SYNTAX_KEY_STRING = 2;
export const RAW_SYNTAX_ESCAPED = 4;
// A whole-document escape always produces one JSON string literal. Marking its
// chunks explicitly lets the UI create a virtual layout in O(chunk count)
// instead of rescanning tens of megabytes merely to recover string state.
export const RAW_SYNTAX_LITERAL_STRING = 8;
const MAX_RAW_VIEWER_CHUNK_SIZE = 0xffff;
const INITIAL_RAW_VIEWER_ROW_CAPACITY = 1024;

function getInitialRawViewerRowCapacity(textLength: number, chunkSize: number) {
  return Math.max(INITIAL_RAW_VIEWER_ROW_CAPACITY, Math.ceil(textLength / chunkSize));
}

function createRawViewerBuffers(capacity: number) {
  const startsByteLength = capacity * Uint32Array.BYTES_PER_ELEMENT;
  const lineNumbersByteLength = capacity * Uint32Array.BYTES_PER_ELEMENT;
  const lengthsByteLength = capacity * Uint16Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(startsByteLength + lineNumbersByteLength + lengthsByteLength + capacity);
  return {
    lengths: new Uint16Array(buffer, startsByteLength + lineNumbersByteLength, capacity),
    lineNumbers: new Uint32Array(buffer, startsByteLength, capacity),
    starts: new Uint32Array(buffer, 0, capacity),
    syntaxStates: new Uint8Array(buffer, startsByteLength + lineNumbersByteLength + lengthsByteLength, capacity),
  };
}

function growRawViewerBuffers(
  starts: Uint32Array,
  lineNumbers: Uint32Array,
  lengths: Uint16Array,
  syntaxStates: Uint8Array,
  minimumCapacity: number
) {
  let capacity = Math.max(1, starts.length);
  while (capacity < minimumCapacity) {
    capacity *= 2;
  }

  const next = createRawViewerBuffers(capacity);
  next.starts.set(starts);
  next.lineNumbers.set(lineNumbers);
  next.lengths.set(lengths);
  next.syntaxStates.set(syntaxStates);
  return next;
}

function createRawViewerDataBuilder(textLength: number, chunkSize: number) {
  const initialCapacity = getInitialRawViewerRowCapacity(textLength, chunkSize);
  let { lengths, lineNumbers, starts, syntaxStates } = createRawViewerBuffers(initialCapacity);
  let rowCount = 0;

  const appendRow = (start: number, end: number, lineNumber: number) => {
    if (rowCount === starts.length) {
      ({ lengths, lineNumbers, starts, syntaxStates } = growRawViewerBuffers(
        starts,
        lineNumbers,
        lengths,
        syntaxStates,
        rowCount + 1
      ));
    }
    starts[rowCount] = start;
    lineNumbers[rowCount] = lineNumber;
    lengths[rowCount] = end - start;
    rowCount += 1;
  };

  return {
    appendLine(start: number, end: number, lineNumber: number) {
      if (start === end) {
        appendRow(start, end, lineNumber);
        return;
      }

      let segmentStart = start;
      while (segmentStart < end) {
        const segmentEnd = Math.min(end, segmentStart + chunkSize);
        appendRow(segmentStart, segmentEnd, segmentStart === start ? lineNumber : 0);
        segmentStart = segmentEnd;
      }
    },
    assignSyntaxStates(text: string) {
      let containerKinds = new Uint8Array(64);
      let expectsKey = new Uint8Array(64);
      let depth = 0;
      let escaped = 0;
      let inString = 0;
      let rowIndex = 0;
      let stringIsKey = 0;
      let nextRowStart = starts[0] ?? -1;

      for (let offset = 0; offset <= text.length; offset += 1) {
        if (offset === nextRowStart) {
          syntaxStates[rowIndex] = inString
            ? RAW_SYNTAX_IN_STRING | (stringIsKey ? RAW_SYNTAX_KEY_STRING : 0) | (escaped ? RAW_SYNTAX_ESCAPED : 0)
            : 0;
          rowIndex += 1;
          nextRowStart = rowIndex < rowCount ? starts[rowIndex] : -1;
        }

        if (offset === text.length) {
          break;
        }

        const character = text.charCodeAt(offset);
        if (inString) {
          if (escaped) {
            escaped = 0;
          } else if (character === 0x5c) {
            escaped = 1;
          } else if (character === 0x22) {
            inString = 0;
            if (stringIsKey && depth > 0 && containerKinds[depth - 1]) {
              expectsKey[depth - 1] = 0;
            }
          }
          continue;
        }

        const top = depth - 1;
        if (character === 0x22) {
          inString = 1;
          stringIsKey = top >= 0 && containerKinds[top] && expectsKey[top] ? 1 : 0;
        } else if (character === 0x7b || character === 0x5b) {
          if (depth === containerKinds.length) {
            const nextKinds = new Uint8Array(depth * 2);
            const nextExpectsKey = new Uint8Array(depth * 2);
            nextKinds.set(containerKinds);
            nextExpectsKey.set(expectsKey);
            containerKinds = nextKinds;
            expectsKey = nextExpectsKey;
          }
          containerKinds[depth] = character === 0x7b ? 1 : 0;
          expectsKey[depth] = character === 0x7b ? 1 : 0;
          depth += 1;
        } else if (character === 0x7d || character === 0x5d) {
          if (depth > 0) {
            depth -= 1;
          }
        } else if (character === 0x2c && top >= 0 && containerKinds[top]) {
          expectsKey[top] = 1;
        }
      }
    },
    finish(): LargeRawViewerData {
      if (starts.length === rowCount) {
        return { lengths, lineNumbers, rowCount, starts, syntaxStates };
      }

      const compact = createRawViewerBuffers(rowCount);
      compact.starts.set(starts.subarray(0, rowCount));
      compact.lineNumbers.set(lineNumbers.subarray(0, rowCount));
      compact.lengths.set(lengths.subarray(0, rowCount));
      compact.syntaxStates.set(syntaxStates.subarray(0, rowCount));
      return {
        lengths: compact.lengths,
        lineNumbers: compact.lineNumbers,
        rowCount,
        starts: compact.starts,
        syntaxStates: compact.syntaxStates,
      };
    },
  };
}

function buildLargeRawViewerDataInternal(text: string, chunkSize: number, includeSyntaxStates: boolean) {
  const safeChunkSize = Math.max(1, Math.min(MAX_RAW_VIEWER_CHUNK_SIZE, Math.floor(chunkSize) || 1));
  const builder = createRawViewerDataBuilder(text.length, safeChunkSize);
  let lineStart = 0;
  let lineNumber = 1;

  while (lineStart <= text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;

    builder.appendLine(lineStart, lineEnd, lineNumber);

    if (newlineIndex === -1) {
      break;
    }

    lineStart = newlineIndex + 1;
    lineNumber += 1;
    if (lineStart === text.length) {
      builder.appendLine(lineStart, lineStart, lineNumber);
      break;
    }
  }

  if (includeSyntaxStates) {
    builder.assignSyntaxStates(text);
  }
  return builder.finish();
}

export function buildLargeRawViewerLayoutData(text: string, chunkSize = RAW_VIEWER_CHUNK_SIZE): LargeRawViewerData {
  return buildLargeRawViewerDataInternal(text, chunkSize, false);
}

export function buildLargeRawViewerData(text: string, chunkSize = RAW_VIEWER_CHUNK_SIZE): LargeRawViewerData {
  return buildLargeRawViewerDataInternal(text, chunkSize, true);
}

export function buildEscapedStringLiteralRawViewerData(
  textLength: number,
  chunkSize = RAW_VIEWER_CHUNK_SIZE
): LargeRawViewerData {
  const safeTextLength = Math.max(0, Math.floor(textLength) || 0);
  const safeChunkSize = Math.max(1, Math.min(MAX_RAW_VIEWER_CHUNK_SIZE, Math.floor(chunkSize) || 1));
  const rowCount = Math.max(1, Math.ceil(safeTextLength / safeChunkSize));
  const { lengths, lineNumbers, starts, syntaxStates } = createRawViewerBuffers(rowCount);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const start = rowIndex * safeChunkSize;
    starts[rowIndex] = start;
    lengths[rowIndex] = Math.min(safeChunkSize, Math.max(0, safeTextLength - start));
    lineNumbers[rowIndex] = rowIndex === 0 ? 1 : 0;
    syntaxStates[rowIndex] = RAW_SYNTAX_LITERAL_STRING;
  }

  return { lengths, lineNumbers, rowCount, starts, syntaxStates };
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
