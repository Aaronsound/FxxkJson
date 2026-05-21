import React, {
  ClipboardEvent as ReactClipboardEvent,
  forwardRef,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_SEARCH_OPTIONS,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  SEARCH_BATCH_SIZE,
} from '../types/jsonTool';
import type { JsonSearchOptions, LargeJsonViewerRegion } from '../types/jsonTool';
import { findSearchMatchesInLargeJson } from '../utils/largeJsonViewerData';
import { buildHighlightedJsonLineSegments, clamp, getCollapsedPreview } from '../utils/largeJsonViewerRender';
import {
  getFirstMeaningfulOffset,
  getLargeJsonLineTitle,
  getLineNumberForOffset,
  getLineNumberFromElement,
  getLineTextElementFromNode,
  getTextOffsetWithin,
} from '../utils/largeJsonViewerDom';
import { getViewportContextMenuPosition } from '../utils/contextMenuPosition';
import LargeJsonContextMenu from './LargeJsonContextMenu';
import type { LargeJsonContextMenuState } from './LargeJsonContextMenu';
import { createTranslator, type I18nKey } from '../utils/i18n';
import { useLargeJsonFolding } from '../hooks/useLargeJsonFolding';
import { useLargeJsonVisibleWindow } from '../hooks/useLargeJsonVisibleWindow';
import { JSON_EDITOR_LINE_HEIGHT } from '../utils/jsonEditorTypography';

const LINE_HEIGHT = JSON_EDITOR_LINE_HEIGHT;
const OVERSCAN = 30;

interface LocalSelectionRange {
  start: number;
  end: number;
}

interface LargeJsonReadonlyViewerProps {
  text: string;
  data: LargeJsonViewerData;
  isDarkMode: boolean;
  wrapLongLines: boolean;
  collapsedLines: number[];
  searchTerm: string;
  searchOptions?: JsonSearchOptions;
  searchMatches?: LargeJsonSearchMatch[];
  activeMatchIndex: number;
  selectedRange?: { start: number; end: number } | null;
  onCollapsedLinesChange: (lines: number[]) => void;
  onMatchCountChange: (count: number) => void;
  onLocateOffset: (offset: number) => void;
  onCopyPath: (offset: number) => void | Promise<void>;
  onCopyKey: (offset: number) => void | Promise<void>;
  onCopyValue: (offset: number) => void | Promise<void>;
  onCopyCompactJson: (offset: number) => void | Promise<void>;
  onCopyFormattedJson: (offset: number) => void | Promise<void>;
  onEditValue: (offset: number) => void | Promise<void>;
  onDeleteValue: (offset: number) => void | Promise<void>;
  onRenameKey: (offset: number) => void | Promise<void>;
  onUnescapeValue: (offset: number) => void | Promise<void>;
  onOpenFind: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

export interface LargeJsonReadonlyViewerHandle {
  foldAll: () => void;
  unfoldAll: () => void;
  focus: () => void;
  revealOffset: (offset: number) => void;
}

const LargeJsonReadonlyViewer = forwardRef<LargeJsonReadonlyViewerHandle, LargeJsonReadonlyViewerProps>(
  (
    {
      text,
      data,
      isDarkMode,
      wrapLongLines,
      collapsedLines,
      searchTerm,
      searchOptions = DEFAULT_SEARCH_OPTIONS,
      searchMatches: searchMatchesFromWorker,
      activeMatchIndex,
      selectedRange = null,
      onCollapsedLinesChange,
      onMatchCountChange,
      onLocateOffset,
      onCopyPath,
      onCopyKey,
      onCopyValue,
      onCopyCompactJson,
      onCopyFormattedJson,
      onEditValue,
      onDeleteValue,
      onRenameKey,
      onUnescapeValue,
      onOpenFind,
      t = defaultT,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const fullDocumentSelectedRef = useRef(false);
    const onCollapsedLinesChangeRef = useRef(onCollapsedLinesChange);
    const onLocateOffsetRef = useRef(onLocateOffset);
    const pendingScrollTopRef = useRef(0);
    const scrollAnimationFrameRef = useRef<number | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [contextMenu, setContextMenu] = useState<LargeJsonContextMenuState | null>(null);
    const rowHeight = wrapLongLines ? LINE_HEIGHT * 4 : LINE_HEIGHT;

    useEffect(() => {
      onCollapsedLinesChangeRef.current = onCollapsedLinesChange;
      onLocateOffsetRef.current = onLocateOffset;
    }, [onCollapsedLinesChange, onLocateOffset]);

    const queueScrollTopUpdate = useCallback((nextScrollTop: number) => {
      pendingScrollTopRef.current = nextScrollTop;

      if (scrollAnimationFrameRef.current !== null) {
        return;
      }

      scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
        scrollAnimationFrameRef.current = null;
        setScrollTop(pendingScrollTopRef.current);
      });
    }, []);

    useEffect(
      () => () => {
        if (scrollAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(scrollAnimationFrameRef.current);
        }
      },
      []
    );

    const {
      collapsedIntervals,
      collapsedLineSet,
      foldAll,
      normalizedCollapsedLines,
      regionsByStartLine,
      toggleLine,
      unfoldAll,
      visibleLineCount,
      visibleSegments,
    } = useLargeJsonFolding({
      collapsedLines,
      data,
      onCollapsedLinesChange,
    });

    const getLineText = useCallback(
      (lineNumber: number) => {
        const start = data.lineStarts[lineNumber - 1] ?? 0;
        const end =
          lineNumber < data.lineCount ? Math.max(start, (data.lineStarts[lineNumber] ?? text.length) - 1) : text.length;
        let value = text.slice(start, end);
        if (value.endsWith('\r')) {
          value = value.slice(0, -1);
        }
        return value;
      },
      [data.lineCount, data.lineStarts, text]
    );

    const normalizedSelectedRange = useMemo(() => {
      if (!selectedRange) {
        return null;
      }

      const start = clamp(Math.min(selectedRange.start, selectedRange.end), 0, text.length);
      const end = clamp(Math.max(selectedRange.start, selectedRange.end), start, text.length);

      return end > start ? { start, end } : null;
    }, [selectedRange, text.length]);

    const getLineDocumentEnd = useCallback(
      (lineNumber: number) => {
        const lineStart = data.lineStarts[lineNumber - 1] ?? 0;
        return lineStart + getLineText(lineNumber).length;
      },
      [data.lineStarts, getLineText]
    );

    const getLineSelectionRange = useCallback(
      (
        lineNumber: number,
        baseLineText: string,
        renderedLineText: string,
        region: LargeJsonViewerRegion | undefined,
        isCollapsed: boolean
      ): LocalSelectionRange | null => {
        if (!normalizedSelectedRange) {
          return null;
        }

        const lineStart = data.lineStarts[lineNumber - 1] ?? 0;
        const lineEnd = lineStart + baseLineText.length;

        if (region && isCollapsed) {
          const regionEnd = getLineDocumentEnd(region.endLine);
          const selectionIntersectsCollapsedRegion =
            normalizedSelectedRange.end > lineStart &&
            normalizedSelectedRange.start < Math.max(regionEnd, lineStart + 1);

          if (!selectionIntersectsCollapsedRegion) {
            return null;
          }

          const localStart =
            normalizedSelectedRange.start > lineEnd
              ? Math.min(getFirstMeaningfulOffset(renderedLineText), renderedLineText.length)
              : clamp(normalizedSelectedRange.start - lineStart, 0, renderedLineText.length);
          const localEnd =
            normalizedSelectedRange.end <= lineEnd
              ? clamp(normalizedSelectedRange.end - lineStart, localStart, renderedLineText.length)
              : renderedLineText.length;

          return localEnd > localStart ? { start: localStart, end: localEnd } : null;
        }

        const selectionIntersectsLine =
          normalizedSelectedRange.end > lineStart && normalizedSelectedRange.start < Math.max(lineEnd, lineStart + 1);

        if (!selectionIntersectsLine) {
          return null;
        }

        const localStart = clamp(normalizedSelectedRange.start - lineStart, 0, renderedLineText.length);
        const localEnd = clamp(normalizedSelectedRange.end - lineStart, localStart, renderedLineText.length);

        return localEnd > localStart ? { start: localStart, end: localEnd } : null;
      },
      [data.lineStarts, getLineDocumentEnd, normalizedSelectedRange]
    );

    const isLineSelected = useCallback(
      (lineNumber: number) => {
        if (!normalizedSelectedRange) {
          return false;
        }

        const lineStart = data.lineStarts[lineNumber - 1] ?? 0;
        const nextLineStart = data.lineStarts[lineNumber];
        const lineEnd =
          lineNumber < data.lineCount ? Math.max(lineStart, (nextLineStart ?? text.length) - 1) : text.length;

        return (
          normalizedSelectedRange.end > lineStart && normalizedSelectedRange.start < Math.max(lineEnd, lineStart + 1)
        );
      },
      [data.lineCount, data.lineStarts, normalizedSelectedRange, text.length]
    );

    const { endVisibleIndex, getActualLineNumber, getVisibleIndexForActualLine, startVisibleIndex } =
      useLargeJsonVisibleWindow({
        rowHeight,
        scrollTop,
        viewportHeight,
        visibleLineCount,
        visibleSegments,
        overscan: OVERSCAN,
      });

    const resolveOffsetFromPoint = useCallback(
      (event: ReactMouseEvent<HTMLElement>, lineNumber: number, lineText: string) => {
        const lineStartOffset = data.lineStarts[lineNumber - 1] ?? 0;
        const doc = document as Document & {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };

        const currentTarget = event.currentTarget;
        let charOffset = getFirstMeaningfulOffset(lineText);

        const caretPosition = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
        if (caretPosition && currentTarget.contains(caretPosition.offsetNode)) {
          charOffset = getTextOffsetWithin(
            currentTarget,
            caretPosition.offsetNode,
            caretPosition.offset,
            lineText.length
          );
        } else {
          const caretRange = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
          if (caretRange && currentTarget.contains(caretRange.startContainer)) {
            charOffset = getTextOffsetWithin(
              currentTarget,
              caretRange.startContainer,
              caretRange.startOffset,
              lineText.length
            );
          }
        }

        return lineStartOffset + Math.max(0, Math.min(charOffset, lineText.length));
      },
      [data.lineStarts]
    );

    const getCollapsedSelectionText = useCallback(
      (lineNumber: number, startOffset: number) => {
        const region = regionsByStartLine.get(lineNumber);
        if (!region) {
          return getLineText(lineNumber);
        }

        const openChar = region.kind === 'array' ? '[' : '{';
        const closeChar = region.kind === 'array' ? ']' : '}';
        const firstLine = getLineText(lineNumber);
        const openIndex = firstLine.lastIndexOf(openChar);
        const closingLine = getLineText(region.endLine);
        const closeIndex = closingLine.lastIndexOf(closeChar);
        const normalizedClosingLine =
          closeIndex >= 0 ? closingLine.slice(0, closeIndex + 1) : closingLine.replace(/,\s*$/, '');

        if (openIndex >= 0 && (startOffset >= openIndex || firstLine.slice(0, openIndex).trim() === '')) {
          const lines = [firstLine.slice(openIndex)];
          for (let currentLine = lineNumber + 1; currentLine < region.endLine; currentLine += 1) {
            lines.push(getLineText(currentLine));
          }

          lines.push(normalizedClosingLine);
          return lines.join('\n');
        }

        const lines = [firstLine];
        for (let currentLine = lineNumber + 1; currentLine < region.endLine; currentLine += 1) {
          lines.push(getLineText(currentLine));
        }
        lines.push(normalizedClosingLine);
        return lines.join('\n');
      },
      [getLineText, regionsByStartLine]
    );

    const getCopyTextForCollapsedSelection = useCallback(
      (startLine: number, endLine: number, startOffset: number, endOffset: number) => {
        let includesCollapsedLine = false;
        for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
          if (collapsedLineSet.has(lineNumber)) {
            includesCollapsedLine = true;
            break;
          }
        }

        if (!includesCollapsedLine) {
          return null;
        }

        if (startLine === endLine && collapsedLineSet.has(startLine)) {
          return getCollapsedSelectionText(startLine, startOffset);
        }

        const parts: string[] = [];
        let lineNumber = startLine;

        while (lineNumber <= endLine) {
          if (collapsedLineSet.has(lineNumber)) {
            const region = regionsByStartLine.get(lineNumber);
            if (region) {
              parts.push(getCollapsedSelectionText(lineNumber, lineNumber === startLine ? startOffset : 0));
              lineNumber = region.endLine + 1;
              continue;
            }
          }

          let lineText = getLineText(lineNumber);
          if (lineNumber === startLine) {
            lineText = lineText.slice(startOffset);
          }
          if (lineNumber === endLine) {
            lineText = lineText.slice(0, endOffset);
          }
          parts.push(lineText);
          lineNumber += 1;
        }

        return parts.join('\n');
      },
      [collapsedLineSet, getCollapsedSelectionText, getLineText, regionsByStartLine]
    );

    const handleSelectAll = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
      const isSelectAll =
        event.key.toLowerCase() === 'a' && (event.metaKey || event.ctrlKey || event.altKey) && !event.shiftKey;

      if (!isSelectAll) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      fullDocumentSelectedRef.current = true;

      const spacer = containerRef.current?.querySelector('.large-json-spacer');
      const selection = window.getSelection();
      if (!spacer || !selection) {
        return;
      }

      const range = document.createRange();
      range.selectNodeContents(spacer);
      selection.removeAllRanges();
      selection.addRange(range);
    }, []);

    const handleKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const isPrimaryShortcut = event.metaKey || event.ctrlKey;
        const isFind = event.key.toLowerCase() === 'f' && isPrimaryShortcut && !event.shiftKey && !event.altKey;

        if (isFind) {
          event.preventDefault();
          event.stopPropagation();
          onOpenFind();
          return;
        }

        handleSelectAll(event);
      },
      [handleSelectAll, onOpenFind]
    );

    const handleCopy = useCallback(
      (event: ReactClipboardEvent<HTMLDivElement>) => {
        if (fullDocumentSelectedRef.current) {
          event.preventDefault();
          event.clipboardData.setData('text/plain', text);
          return;
        }

        const container = containerRef.current;
        const selection = window.getSelection();
        if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
          return;
        }

        const range = selection.getRangeAt(0);
        const startElement = getLineTextElementFromNode(range.startContainer, container);
        const endElement = getLineTextElementFromNode(range.endContainer, container);
        if (!startElement || !endElement) {
          return;
        }

        const startLine = getLineNumberFromElement(startElement);
        const endLine = getLineNumberFromElement(endElement);
        if (startLine === null || endLine === null || startLine > endLine) {
          return;
        }

        const startOffset = getTextOffsetWithin(
          startElement,
          range.startContainer,
          range.startOffset,
          startElement.textContent?.length ?? 0
        );
        const endOffset = getTextOffsetWithin(
          endElement,
          range.endContainer,
          range.endOffset,
          endElement.textContent?.length ?? 0
        );
        const copyText = getCopyTextForCollapsedSelection(startLine, endLine, startOffset, endOffset);

        if (copyText === null) {
          return;
        }

        event.preventDefault();
        event.clipboardData.setData('text/plain', copyText);
      },
      [getCopyTextForCollapsedSelection, text]
    );

    const searchMatches = useMemo(
      () =>
        searchMatchesFromWorker ??
        findSearchMatchesInLargeJson(
          text,
          data.lineStarts,
          data.lineCount,
          searchTerm,
          searchOptions,
          SEARCH_BATCH_SIZE
        ),
      [data.lineCount, data.lineStarts, searchMatchesFromWorker, searchOptions, searchTerm, text]
    );

    const matchesByLine = useMemo(() => {
      const map = new Map<number, Array<LargeJsonSearchMatch & { matchIndex: number }>>();

      searchMatches.forEach((match, index) => {
        const lineMatches = map.get(match.lineNumber) ?? [];
        lineMatches.push({
          ...match,
          matchIndex: index,
        });
        map.set(match.lineNumber, lineMatches);
      });

      return map;
    }, [searchMatches]);

    const effectiveMatchIndex =
      searchMatches.length > 0
        ? ((activeMatchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length
        : 0;
    const activeMatch = searchMatches[effectiveMatchIndex] ?? null;

    useImperativeHandle(
      ref,
      () => ({
        foldAll,
        unfoldAll,
        focus() {
          containerRef.current?.focus({ preventScroll: true });
        },
        revealOffset(offset: number) {
          const lineNumber = getLineNumberForOffset(data.lineStarts, clamp(Math.floor(offset), 0, text.length));
          const containingCollapsedRegion = collapsedIntervals.find(
            (interval) => lineNumber >= interval.start && lineNumber <= interval.end
          );

          if (containingCollapsedRegion) {
            onCollapsedLinesChange(
              normalizedCollapsedLines.filter((line) => line !== containingCollapsedRegion.triggerLine)
            );
            return;
          }

          const visibleIndex = getVisibleIndexForActualLine(lineNumber);
          if (visibleIndex !== null && containerRef.current) {
            containerRef.current.scrollTop = Math.max(0, (visibleIndex - 3) * rowHeight);
            containerRef.current.focus({ preventScroll: true });
          }
        },
      }),
      [
        collapsedIntervals,
        data.lineStarts,
        foldAll,
        getVisibleIndexForActualLine,
        normalizedCollapsedLines,
        onCollapsedLinesChange,
        rowHeight,
        text.length,
        unfoldAll,
      ]
    );

    useEffect(() => {
      onMatchCountChange(searchMatches.length);
    }, [onMatchCountChange, searchMatches.length]);

    useEffect(() => {
      setContextMenu(null);
    }, [searchTerm]);

    useEffect(() => {
      if (!activeMatch) {
        return;
      }

      const containingCollapsedRegion = collapsedIntervals.find(
        (interval) => activeMatch.lineNumber >= interval.start && activeMatch.lineNumber <= interval.end
      );

      if (containingCollapsedRegion) {
        const next = normalizedCollapsedLines.filter((line) => line !== containingCollapsedRegion.triggerLine);
        onCollapsedLinesChangeRef.current(next);
        return;
      }

      const visibleIndex = getVisibleIndexForActualLine(activeMatch.lineNumber);
      if (visibleIndex !== null && containerRef.current) {
        containerRef.current.scrollTop = Math.max(0, (visibleIndex - 3) * rowHeight);
      }

      onLocateOffsetRef.current(activeMatch.start);
    }, [activeMatch, collapsedIntervals, getVisibleIndexForActualLine, normalizedCollapsedLines, rowHeight]);

    useEffect(() => {
      const handleGlobalPointer = () => setContextMenu(null);
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setContextMenu(null);
        }
      };

      window.addEventListener('pointerdown', handleGlobalPointer);
      window.addEventListener('keydown', handleEscape);
      return () => {
        window.removeEventListener('pointerdown', handleGlobalPointer);
        window.removeEventListener('keydown', handleEscape);
      };
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const syncSize = () => {
        setViewportHeight(container.clientHeight);
      };

      syncSize();
      const observer = new ResizeObserver(syncSize);
      observer.observe(container);
      return () => observer.disconnect();
    }, []);

    const lineNumberWidth = `${Math.max(3, String(data.lineCount).length)}ch`;

    const renderLineText = useCallback(
      (lineNumber: number, lineText: string, selectedLineRange: LocalSelectionRange | null) => {
        const segments = buildHighlightedJsonLineSegments(
          lineText,
          matchesByLine.get(lineNumber) ?? [],
          effectiveMatchIndex
        );

        if (segments.length === 0) {
          return lineText;
        }

        let segmentStart = 0;

        return segments.map((segment, partIndex) => {
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
              <span
                key={`${key}-selection`}
                className="rightNodeSelectionHighlight large-json-node-selection-highlight"
              >
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
        });
      },
      [effectiveMatchIndex, matchesByLine]
    );

    const renderedRows = [];

    for (let visibleIndex = startVisibleIndex; visibleIndex <= endVisibleIndex; visibleIndex += 1) {
      const lineNumber = getActualLineNumber(visibleIndex);
      if (lineNumber === null) {
        continue;
      }

      const region = regionsByStartLine.get(lineNumber);
      const isCollapsed = collapsedLineSet.has(lineNumber);
      const baseLineText = getLineText(lineNumber);
      const lineText = region && isCollapsed ? getCollapsedPreview(baseLineText) : baseLineText;
      const isSelected = isLineSelected(lineNumber);
      const selectedLineRange = getLineSelectionRange(lineNumber, baseLineText, lineText, region, isCollapsed);

      renderedRows.push(
        <div
          key={`${lineNumber}-${visibleIndex}`}
          className={`large-json-row ${wrapLongLines ? 'wrap' : ''} ${isSelected ? 'selected' : ''}`}
          onMouseUp={(event) => {
            if (event.button !== 0) {
              return;
            }

            if (event.target instanceof HTMLElement && event.target.closest('.large-json-fold-button')) {
              return;
            }

            const offset = (data.lineStarts[lineNumber - 1] ?? 0) + getFirstMeaningfulOffset(baseLineText);
            onLocateOffset(offset);
          }}
          style={{
            top: `${visibleIndex * rowHeight}px`,
            height: `${rowHeight}px`,
          }}
        >
          <span className="large-json-line-number" style={{ width: lineNumberWidth }}>
            {lineNumber}
          </span>
          <button
            type="button"
            className={`large-json-fold-button ${region ? 'visible' : ''} ${isCollapsed ? 'collapsed' : 'expanded'}`}
            onClick={() => toggleLine(lineNumber)}
            onMouseDown={(event) => event.preventDefault()}
            disabled={!region}
            aria-label={isCollapsed ? 'Expand node' : 'Collapse node'}
          />
          <span
            className={`large-json-line-text ${wrapLongLines ? 'wrap' : ''}`}
            data-line-number={lineNumber}
            data-collapsed={isCollapsed ? 'true' : undefined}
            title={getLargeJsonLineTitle(lineText)}
            onMouseUp={(event) => {
              if (event.button !== 0) {
                return;
              }

              const offset = resolveOffsetFromPoint(event, lineNumber, baseLineText);
              event.stopPropagation();
              onLocateOffset(offset);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const offset = resolveOffsetFromPoint(event, lineNumber, baseLineText);
              const menuPosition = getViewportContextMenuPosition(
                event.clientX,
                event.clientY,
                regionsByStartLine.has(lineNumber) ? 10 : 9
              );
              setContextMenu({
                x: menuPosition.x,
                y: menuPosition.y,
                offset,
                foldLine: regionsByStartLine.has(lineNumber) ? lineNumber : null,
              });
            }}
          >
            {renderLineText(lineNumber, lineText, selectedLineRange)}
          </span>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={`large-json-viewer ${isDarkMode ? 'dark' : ''}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={() => {
          fullDocumentSelectedRef.current = false;
          containerRef.current?.focus({ preventScroll: true });
        }}
        onScroll={(event) => queueScrollTopUpdate(event.currentTarget.scrollTop)}
        onCopy={handleCopy}
      >
        <div className="large-json-spacer" style={{ height: `${Math.max(visibleLineCount, 1) * rowHeight}px` }}>
          {renderedRows}
        </div>
        {contextMenu && (
          <LargeJsonContextMenu
            contextMenu={contextMenu}
            isCollapsed={contextMenu.foldLine !== null && collapsedLineSet.has(contextMenu.foldLine)}
            isDarkMode={isDarkMode}
            onClose={() => setContextMenu(null)}
            onToggleFold={toggleLine}
            onCopyPath={onCopyPath}
            onCopyKey={onCopyKey}
            onCopyValue={onCopyValue}
            onCopyCompactJson={onCopyCompactJson}
            onCopyFormattedJson={onCopyFormattedJson}
            onEditValue={onEditValue}
            onRenameKey={onRenameKey}
            onDeleteValue={onDeleteValue}
            onUnescapeValue={onUnescapeValue}
            t={t}
          />
        )}
      </div>
    );
  }
);

LargeJsonReadonlyViewer.displayName = 'LargeJsonReadonlyViewer';

export default LargeJsonReadonlyViewer;
