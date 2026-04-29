import {
  DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD,
} from '../types/jsonTool';
import type {
  JsonSearchOptions,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  LargeJsonViewerRegion,
} from '../types/jsonTool';
import { findTextSearchMatches } from './searchText';

export function buildLargeViewerData(
  text: string,
  lineThreshold = DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD
): LargeJsonViewerData | null {
  const lineStarts = [0];
  const regions: LargeJsonViewerRegion[] = [];
  const stack: Array<{ close: '}' | ']'; startLine: number; kind: 'object' | 'array' }> = [];
  let line = 1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '\n') {
      line += 1;
      lineStarts.push(index + 1);
      continue;
    }

    if (char === '{') {
      stack.push({ close: '}', startLine: line, kind: 'object' });
      continue;
    }

    if (char === '[') {
      stack.push({ close: ']', startLine: line, kind: 'array' });
      continue;
    }

    if (char === '}' || char === ']') {
      const current = stack.pop();
      if (!current || current.close !== char) {
        continue;
      }

      if (current.startLine < line) {
        regions.push({
          startLine: current.startLine,
          endLine: line,
          kind: current.kind,
        });
      }
    }
  }

  if (lineStarts.length <= lineThreshold) {
    return null;
  }

  regions.sort((left, right) => {
    if (left.startLine !== right.startLine) {
      return left.startLine - right.startLine;
    }

    return right.endLine - left.endLine;
  });

  return {
    lineStarts: Uint32Array.from(lineStarts),
    regions,
    lineCount: lineStarts.length,
  };
}

export function binarySearchLineStarts(lineStarts: Uint32Array, offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = lineStarts[mid];

    if (value <= offset) {
      result = mid;
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  return result;
}

export function findSearchMatchesInLargeJson(
  text: string,
  lineStarts: Uint32Array,
  lineCount: number,
  searchTerm: string,
  options: JsonSearchOptions
): LargeJsonSearchMatch[] {
  return findTextSearchMatches(text, lineStarts, lineCount, searchTerm, options);
}
