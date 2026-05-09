import type { LargeJsonViewerData } from '../types/jsonTool';
import { binarySearchLineStarts } from './largeJsonViewerData';

const JSON_TOKEN_SOURCE = String.raw`"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b`;

export interface LocateRange {
  startOffset: number;
  endOffset: number;
}

interface TokenCandidate {
  token: string;
  occurrenceIndex: number;
  distance: number;
  start: number;
}

function createJsonTokenPattern() {
  return new RegExp(JSON_TOKEN_SOURCE, 'g');
}

function getDistanceToRange(offset: number, start: number, end: number) {
  if (offset < start) {
    return start - offset;
  }

  if (offset > end) {
    return offset - end;
  }

  return 0;
}

function getLineRange(textLength: number, viewerData: LargeJsonViewerData, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, textLength));
  const lineStarts = viewerData.lineStarts;
  const lineIndex = binarySearchLineStarts(lineStarts, safeOffset);
  const lineStartOffset = lineStarts[lineIndex] ?? 0;
  const nextLineStart = lineStarts[lineIndex + 1];
  const lineEndOffset = typeof nextLineStart === 'number'
    ? Math.max(lineStartOffset + 1, nextLineStart - 1)
    : Math.max(lineStartOffset + 1, textLength);

  return {
    lineStartOffset,
    lineEndOffset,
  };
}

function getTokenOccurrenceIndex(text: string, token: string, targetStart: number) {
  const pattern = createJsonTokenPattern();
  let occurrenceIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index >= targetStart) {
      return occurrenceIndex;
    }

    if (match[0] === token) {
      occurrenceIndex += 1;
    }
  }

  return occurrenceIndex;
}

function findTokenOccurrence(text: string, token: string, targetOccurrenceIndex: number) {
  const pattern = createJsonTokenPattern();
  let occurrenceIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match[0] !== token) {
      continue;
    }

    if (occurrenceIndex === targetOccurrenceIndex) {
      return match.index;
    }

    occurrenceIndex += 1;
  }

  return -1;
}

function getTokenCandidates(
  formattedText: string,
  lineStartOffset: number,
  lineEndOffset: number,
  offset: number
) {
  const lineText = formattedText.slice(lineStartOffset, lineEndOffset);
  const pattern = createJsonTokenPattern();
  const candidates: TokenCandidate[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(lineText)) !== null) {
    const token = match[0];
    const start = lineStartOffset + match.index;
    const end = start + token.length;

    candidates.push({
      token,
      occurrenceIndex: getTokenOccurrenceIndex(formattedText, token, start),
      distance: getDistanceToRange(offset, start, end),
      start,
    });
  }

  return candidates.sort((left, right) => (
    left.distance - right.distance || left.start - right.start
  ));
}

export function getIdentityLocateRange(
  textLength: number,
  viewerData: LargeJsonViewerData,
  offset: number
): LocateRange {
  const { lineStartOffset, lineEndOffset } = getLineRange(textLength, viewerData, offset);

  return {
    startOffset: lineStartOffset,
    endOffset: lineEndOffset,
  };
}

export function getLightweightTokenLocateRange(
  rawText: string,
  formattedText: string,
  viewerData: LargeJsonViewerData,
  offset: number
): LocateRange | null {
  const { lineStartOffset, lineEndOffset } = getLineRange(formattedText.length, viewerData, offset);
  const candidates = getTokenCandidates(
    formattedText,
    lineStartOffset,
    lineEndOffset,
    Math.max(0, Math.min(offset, formattedText.length))
  );

  for (const candidate of candidates) {
    const rawStart = findTokenOccurrence(
      rawText,
      candidate.token,
      candidate.occurrenceIndex
    );

    if (rawStart !== -1) {
      return {
        startOffset: rawStart,
        endOffset: rawStart + candidate.token.length,
      };
    }
  }

  return null;
}
