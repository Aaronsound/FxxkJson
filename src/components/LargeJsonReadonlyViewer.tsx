import {
  forwardRef,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { DEFAULT_SEARCH_OPTIONS, type LargeJsonSearchMatch, type LargeJsonViewerData } from '../types/jsonTool';
import type { JsonSearchOptions } from '../types/jsonTool';
import { buildLargeJsonRowOffsets, clamp, getLargeJsonWrapColumnCount } from '../utils/largeJsonViewerRender';
import { getFirstMeaningfulOffset, getLineNumberForOffset, getTextOffsetWithin } from '../utils/largeJsonViewerDom';
import LargeJsonContextMenu from './LargeJsonContextMenu';
import { LargeJsonLineText } from './LargeJsonLineText';
import { LargeJsonVisibleRows } from './LargeJsonVisibleRows';
import { createTranslator, type I18nKey } from '../utils/i18n';
import { useLargeJsonFolding } from '../hooks/useLargeJsonFolding';
import { useLargeJsonVisibleWindow } from '../hooks/useLargeJsonVisibleWindow';
import { useLargeJsonSelection, type LargeJsonLocalSelectionRange } from '../hooks/useLargeJsonSelection';
import { useLargeJsonContextMenu } from '../hooks/useLargeJsonContextMenu';
import { useLargeJsonViewport } from '../hooks/useLargeJsonViewport';
import { useLargeJsonSearchMatches } from '../hooks/useLargeJsonSearchMatches';
import { useLargeJsonActiveMatchReveal } from '../hooks/useLargeJsonActiveMatchReveal';
import { JSON_EDITOR_LINE_HEIGHT } from '../utils/jsonEditorTypography';

const LINE_HEIGHT = JSON_EDITOR_LINE_HEIGHT;
const OVERSCAN = 30;

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
    const { closeContextMenu, contextMenu, setContextMenu } = useLargeJsonContextMenu({ searchTerm });
    const { queueScrollTopUpdate, scrollTop, viewportHeight, viewportWidth } = useLargeJsonViewport({ containerRef });
    const rowHeight = LINE_HEIGHT;

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
    const lineNumberDigits = Math.max(3, String(data.lineCount).length);
    const wrapColumnCount = getLargeJsonWrapColumnCount(viewportWidth, lineNumberDigits);
    const rowOffsets = useMemo(
      () =>
        wrapLongLines
          ? buildLargeJsonRowOffsets({
              lineHeight: rowHeight,
              lineStarts: data.lineStarts,
              textLength: text.length,
              visibleLineCount,
              visibleSegments,
              wrapColumnCount,
            })
          : null,
      [data.lineStarts, text.length, visibleLineCount, visibleSegments, wrapColumnCount, wrapLongLines]
    );

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

    const {
      endVisibleIndex,
      getActualLineNumber,
      getRowHeight,
      getRowTop,
      getVisibleIndexForActualLine,
      startVisibleIndex,
    } = useLargeJsonVisibleWindow({
      rowHeight,
      rowOffsets,
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

    const { getLineSelectionRange, handleCopy, handleKeyDown, isLineSelected, resetFullDocumentSelection } =
      useLargeJsonSelection({
        collapsedLineSet,
        containerRef,
        data,
        getLineText,
        onOpenFind,
        regionsByStartLine,
        selectedRange,
        text,
      });

    const { activeMatch, effectiveMatchIndex, matchesByLine } = useLargeJsonSearchMatches({
      activeMatchIndex,
      data,
      onMatchCountChange,
      searchMatchesFromWorker,
      searchOptions,
      searchTerm,
      text,
    });

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
            containerRef.current.scrollTop = getRowTop(Math.max(0, visibleIndex - 3));
            containerRef.current.focus({ preventScroll: true });
          }
        },
      }),
      [
        collapsedIntervals,
        data.lineStarts,
        foldAll,
        getRowTop,
        getVisibleIndexForActualLine,
        normalizedCollapsedLines,
        onCollapsedLinesChange,
        text.length,
        unfoldAll,
      ]
    );

    useLargeJsonActiveMatchReveal({
      activeMatch,
      collapsedIntervals,
      containerRef,
      getVisibleIndexForActualLine,
      getRowTop,
      normalizedCollapsedLines,
      onCollapsedLinesChange,
      onLocateOffset,
    });

    const lineNumberWidth = `${lineNumberDigits}ch`;
    const contentHeight = Math.max(rowHeight, rowOffsets?.[rowOffsets.length - 1] ?? visibleLineCount * rowHeight);

    const renderLineText = useCallback(
      (lineNumber: number, lineText: string, selectedLineRange: LargeJsonLocalSelectionRange | null) => {
        return (
          <LargeJsonLineText
            activeMatchIndex={effectiveMatchIndex}
            lineNumber={lineNumber}
            lineText={lineText}
            matches={matchesByLine.get(lineNumber) ?? []}
            selectedLineRange={selectedLineRange}
          />
        );
      },
      [effectiveMatchIndex, matchesByLine]
    );

    return (
      <div
        ref={containerRef}
        className={`large-json-viewer ${isDarkMode ? 'dark' : ''}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={() => {
          resetFullDocumentSelection();
          containerRef.current?.focus({ preventScroll: true });
        }}
        onScroll={(event) => queueScrollTopUpdate(event.currentTarget.scrollTop)}
        onCopy={handleCopy}
      >
        <div className="large-json-spacer" style={{ height: `${contentHeight}px` }}>
          <LargeJsonVisibleRows
            collapsedLineSet={collapsedLineSet}
            data={data}
            endVisibleIndex={endVisibleIndex}
            getActualLineNumber={getActualLineNumber}
            getLineSelectionRange={getLineSelectionRange}
            getLineText={getLineText}
            getRowHeight={getRowHeight}
            getRowTop={getRowTop}
            isLineSelected={isLineSelected}
            lineNumberWidth={lineNumberWidth}
            onLocateOffset={onLocateOffset}
            regionsByStartLine={regionsByStartLine}
            renderLineText={renderLineText}
            resolveOffsetFromPoint={resolveOffsetFromPoint}
            setContextMenu={setContextMenu}
            startVisibleIndex={startVisibleIndex}
            toggleLine={toggleLine}
            wrapLongLines={wrapLongLines}
          />
        </div>
        {contextMenu && (
          <LargeJsonContextMenu
            contextMenu={contextMenu}
            isCollapsed={contextMenu.foldLine !== null && collapsedLineSet.has(contextMenu.foldLine)}
            isParentCollapsed={contextMenu.parentFoldLine !== null && collapsedLineSet.has(contextMenu.parentFoldLine)}
            isDarkMode={isDarkMode}
            onClose={closeContextMenu}
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
