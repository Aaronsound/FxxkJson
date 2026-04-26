export interface VisibleSegment {
  actualStart: number;
  actualEnd: number;
  visibleStart: number;
  visibleEnd: number;
}

export interface CollapsedInterval {
  start: number;
  end: number;
  triggerLine: number;
}

export interface JsonSyntaxToken {
  start: number;
  end: number;
  className?: string;
}

export function getCollapsedPreview(lineText: string) {
  const trimmedEnd = lineText.replace(/\s+$/, '');
  return `${trimmedEnd} ...`;
}

export function binarySearchSegment(segments: VisibleSegment[], visibleIndex: number) {
  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = segments[mid];

    if (visibleIndex < current.visibleStart) {
      high = mid - 1;
      continue;
    }

    if (visibleIndex > current.visibleEnd) {
      low = mid + 1;
      continue;
    }

    return current;
  }

  return null;
}

export function buildVisibleSegments(
  lineCount: number,
  collapsedIntervals: CollapsedInterval[]
): VisibleSegment[] {
  const segments: VisibleSegment[] = [];
  let actualLine = 1;
  let visibleLine = 0;

  collapsedIntervals.forEach((interval) => {
    if (actualLine <= interval.start - 1) {
      const actualStart = actualLine;
      const actualEnd = interval.start - 1;
      const length = actualEnd - actualStart + 1;

      segments.push({
        actualStart,
        actualEnd,
        visibleStart: visibleLine,
        visibleEnd: visibleLine + length - 1,
      });
      visibleLine += length;
    }

    actualLine = Math.max(actualLine, interval.end + 1);
  });

  if (actualLine <= lineCount) {
    const length = lineCount - actualLine + 1;
    segments.push({
      actualStart: actualLine,
      actualEnd: lineCount,
      visibleStart: visibleLine,
      visibleEnd: visibleLine + length - 1,
    });
  }

  return segments;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getJsonStringEnd(lineText: string, start: number) {
  let index = start + 1;
  let escaped = false;

  while (index < lineText.length) {
    const char = lineText[index];

    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      return index + 1;
    }

    index += 1;
  }

  return lineText.length;
}

function getNextNonWhitespaceIndex(lineText: string, start: number) {
  let index = start;

  while (index < lineText.length && /\s/.test(lineText[index])) {
    index += 1;
  }

  return index;
}

export function tokenizeJsonLine(lineText: string): JsonSyntaxToken[] {
  const tokens: JsonSyntaxToken[] = [];
  let index = 0;

  const pushToken = (start: number, end: number, className?: string) => {
    if (end > start) {
      tokens.push({ start, end, className });
    }
  };

  while (index < lineText.length) {
    const char = lineText[index];

    if (/\s/.test(char)) {
      const start = index;
      while (index < lineText.length && /\s/.test(lineText[index])) {
        index += 1;
      }
      pushToken(start, index);
      continue;
    }

    if (char === '"') {
      const end = getJsonStringEnd(lineText, index);
      const nextNonWhitespace = getNextNonWhitespaceIndex(lineText, end);
      const className = lineText[nextNonWhitespace] === ':'
        ? 'large-json-token large-json-token-key'
        : 'large-json-token large-json-token-value large-json-token-string';

      pushToken(index, end, className);
      index = end;
      continue;
    }

    if (char === '-' || /\d/.test(char)) {
      const match = lineText.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        pushToken(
          index,
          index + match[0].length,
          'large-json-token large-json-token-value large-json-token-number'
        );
        index += match[0].length;
        continue;
      }
    }

    const literal = ['true', 'false', 'null'].find((candidate) => lineText.startsWith(candidate, index));
    if (literal) {
      pushToken(
        index,
        index + literal.length,
        'large-json-token large-json-token-value large-json-token-literal'
      );
      index += literal.length;
      continue;
    }

    if ('{}[]:,.'.includes(char)) {
      pushToken(index, index + 1, 'large-json-token large-json-token-punctuation');
      index += 1;
      continue;
    }

    pushToken(index, index + 1);
    index += 1;
  }

  return tokens;
}
