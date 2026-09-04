import React from 'react';
import type { LargeJsonLocalSelectionRange } from '../hooks/useLargeJsonSelection';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import { buildHighlightedJsonLineSegments } from '../utils/largeJsonViewerRender';

type LargeJsonLineMatch = LargeJsonSearchMatch & { matchIndex: number };

interface LargeJsonLineTextProps {
  activeMatchIndex: number;
  lineNumber: number;
  lineText: string;
  literalString?: boolean;
  matches: LargeJsonLineMatch[];
  selectedLineRange: LargeJsonLocalSelectionRange | null;
}

function equalSelectionRange(left: LargeJsonLocalSelectionRange | null, right: LargeJsonLocalSelectionRange | null) {
  return left === right || Boolean(left && right && left.start === right.start && left.end === right.end);
}

export function areLargeJsonLineTextPropsEqual(previous: LargeJsonLineTextProps, next: LargeJsonLineTextProps) {
  if (
    previous.lineNumber !== next.lineNumber ||
    previous.lineText !== next.lineText ||
    previous.literalString !== next.literalString ||
    previous.matches !== next.matches ||
    !equalSelectionRange(previous.selectedLineRange, next.selectedLineRange)
  ) {
    return false;
  }

  if (previous.activeMatchIndex === next.activeMatchIndex) {
    return true;
  }

  return !previous.matches.some(
    (match) => match.matchIndex === previous.activeMatchIndex || match.matchIndex === next.activeMatchIndex
  );
}

function LargeJsonLineTextView({
  activeMatchIndex,
  lineNumber,
  lineText,
  literalString = false,
  matches,
  selectedLineRange,
}: LargeJsonLineTextProps) {
  const segments = literalString
    ? buildLiteralStringSegments(lineText, matches, activeMatchIndex)
    : buildHighlightedJsonLineSegments(lineText, matches, activeMatchIndex);

  if (segments.length === 0) {
    return <>{lineText}</>;
  }

  let segmentStart = 0;

  return (
    <>
      {segments.map((segment, partIndex) => {
        const key = `${lineNumber}-${partIndex}`;
        const currentSegmentStart = segmentStart;
        const currentSegmentEnd = currentSegmentStart + segment.text.length;
        segmentStart = currentSegmentEnd;

        const buildSyntaxContent = (textPart: string, contentKey: string) =>
          segment.className ? (
            <span key={contentKey} className={segment.className}>
              {textPart}
            </span>
          ) : (
            <React.Fragment key={contentKey}>{textPart}</React.Fragment>
          );

        const renderSegmentContent = () => {
          const selectionStart = selectedLineRange
            ? Math.max(currentSegmentStart, selectedLineRange.start)
            : currentSegmentEnd;
          const selectionEnd = selectedLineRange
            ? Math.min(currentSegmentEnd, selectedLineRange.end)
            : currentSegmentStart;

          if (!selectedLineRange || selectionEnd <= selectionStart) {
            return buildSyntaxContent(segment.text, `${key}-plain`);
          }

          const parts: React.ReactNode[] = [];
          const localSelectionStart = selectionStart - currentSegmentStart;
          const localSelectionEnd = selectionEnd - currentSegmentStart;

          if (localSelectionStart > 0) {
            parts.push(buildSyntaxContent(segment.text.slice(0, localSelectionStart), `${key}-before`));
          }

          const selectedText = segment.text.slice(localSelectionStart, localSelectionEnd);
          parts.push(
            <span key={`${key}-selection`} className="rightNodeSelectionHighlight large-json-node-selection-highlight">
              {buildSyntaxContent(selectedText, `${key}-selection-content`)}
            </span>
          );

          if (localSelectionEnd < segment.text.length) {
            parts.push(buildSyntaxContent(segment.text.slice(localSelectionEnd), `${key}-after`));
          }

          return parts;
        };

        const content = renderSegmentContent();

        if (!segment.isSearchMatch) {
          return <React.Fragment key={key}>{content}</React.Fragment>;
        }

        return (
          <mark key={key} className={`large-json-search-match ${segment.isActiveSearchMatch ? 'active' : ''}`}>
            {content}
          </mark>
        );
      })}
    </>
  );
}

function buildLiteralStringSegments(lineText: string, matches: LargeJsonLineMatch[], activeMatchIndex: number) {
  const className = 'large-json-token large-json-token-value large-json-token-string';
  const segments: ReturnType<typeof buildHighlightedJsonLineSegments> = [];
  let cursor = 0;

  for (const match of matches) {
    const start = Math.max(cursor, Math.min(lineText.length, match.localStart));
    const end = Math.max(start, Math.min(lineText.length, match.localEnd));
    if (start > cursor) {
      segments.push({
        className,
        isActiveSearchMatch: false,
        isSearchMatch: false,
        text: lineText.slice(cursor, start),
      });
    }
    if (end > start) {
      segments.push({
        className,
        isActiveSearchMatch: match.matchIndex === activeMatchIndex,
        isSearchMatch: true,
        matchIndex: match.matchIndex,
        text: lineText.slice(start, end),
      });
    }
    cursor = end;
  }

  if (cursor < lineText.length) {
    segments.push({ className, isActiveSearchMatch: false, isSearchMatch: false, text: lineText.slice(cursor) });
  }
  return segments;
}

export const LargeJsonLineText = React.memo(LargeJsonLineTextView, areLargeJsonLineTextPropsEqual);
LargeJsonLineText.displayName = 'LargeJsonLineText';
