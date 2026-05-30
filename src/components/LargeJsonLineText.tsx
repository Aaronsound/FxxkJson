import React from 'react';
import type { LargeJsonSearchMatch } from '../types/jsonTool';
import type { LargeJsonLocalSelectionRange } from '../hooks/useLargeJsonSelection';
import { buildHighlightedJsonLineSegments } from '../utils/largeJsonViewerRender';

type LargeJsonLineMatch = LargeJsonSearchMatch & { matchIndex: number };

interface LargeJsonLineTextProps {
  activeMatchIndex: number;
  lineNumber: number;
  lineText: string;
  matches: LargeJsonLineMatch[];
  selectedLineRange: LargeJsonLocalSelectionRange | null;
}

export function LargeJsonLineText({
  activeMatchIndex,
  lineNumber,
  lineText,
  matches,
  selectedLineRange,
}: LargeJsonLineTextProps) {
  const segments = buildHighlightedJsonLineSegments(lineText, matches, activeMatchIndex);

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
