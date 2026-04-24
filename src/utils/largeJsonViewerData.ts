import {
  DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD,
  LargeJsonViewerData,
  LargeJsonViewerRegion,
} from '../types/jsonTool';

export interface LargeJsonSearchMatch {
  start: number;
  end: number;
  lineNumber: number;
  lineStartOffset: number;
  localStart: number;
  localEnd: number;
}

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
  searchTerm: string
): LargeJsonSearchMatch[] {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  if (!normalizedTerm) {
    return [];
  }

  const normalizedText = text.toLowerCase();
  const matches: LargeJsonSearchMatch[] = [];
  let fromIndex = 0;

  while (fromIndex < normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedTerm, fromIndex);
    if (matchIndex === -1) {
      break;
    }

    const lineIndex = binarySearchLineStarts(lineStarts, matchIndex);
    const lineNumber = lineIndex + 1;
    const lineStartOffset = lineStarts[lineIndex] ?? 0;
    const lineEndOffset = lineNumber < lineCount
      ? Math.max(lineStartOffset, (lineStarts[lineNumber] ?? text.length) - 1)
      : text.length;
    const localStart = matchIndex - lineStartOffset;
    const localEnd = Math.min(matchIndex + normalizedTerm.length, lineEndOffset) - lineStartOffset;

    matches.push({
      start: matchIndex,
      end: matchIndex + normalizedTerm.length,
      lineNumber,
      lineStartOffset,
      localStart,
      localEnd,
    });

    fromIndex = matchIndex + Math.max(normalizedTerm.length, 1);
  }

  return matches;
}
