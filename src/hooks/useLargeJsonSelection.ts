import {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { LargeJsonViewerData, LargeJsonViewerRegion } from '../types/jsonTool';
import {
  getFirstMeaningfulOffset,
  getLineNumberFromElement,
  getLineTextElementFromNode,
  getTextOffsetWithin,
} from '../utils/largeJsonViewerDom';
import { clamp } from '../utils/largeJsonViewerRender';
import { writeTextToClipboard } from '../utils/clipboard';
import { getCopyTextForCollapsedSelection as getCollapsedCopyText } from '../utils/largeJsonSelectionCopy';

export interface LargeJsonLocalSelectionRange {
  start: number;
  end: number;
}

interface UseLargeJsonSelectionParams {
  collapsedLineSet: Set<number>;
  containerRef: RefObject<HTMLDivElement | null>;
  data: LargeJsonViewerData;
  getLineText: (lineNumber: number) => string;
  onOpenFind: () => void;
  regionsByStartLine: Map<number, LargeJsonViewerRegion>;
  selectedRange: { start: number; end: number } | null;
  text: string;
}

export function useLargeJsonSelection({
  collapsedLineSet,
  containerRef,
  data,
  getLineText,
  onOpenFind,
  regionsByStartLine,
  selectedRange,
  text,
}: UseLargeJsonSelectionParams) {
  const fullDocumentSelectedRef = useRef(false);

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
    ): LargeJsonLocalSelectionRange | null => {
      if (!normalizedSelectedRange) {
        return null;
      }

      const lineStart = data.lineStarts[lineNumber - 1] ?? 0;
      const lineEnd = lineStart + baseLineText.length;

      if (region && isCollapsed) {
        const regionEnd = getLineDocumentEnd(region.endLine);
        const selectionIntersectsCollapsedRegion =
          normalizedSelectedRange.end > lineStart && normalizedSelectedRange.start < Math.max(regionEnd, lineStart + 1);

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

  const getCopyTextForCollapsedSelection = useCallback(
    (startLine: number, endLine: number, startOffset: number, endOffset: number) => {
      return getCollapsedCopyText({
        collapsedLineSet,
        endLine,
        endOffset,
        getLineText,
        regionsByStartLine,
        startLine,
        startOffset,
      });
    },
    [collapsedLineSet, getLineText, regionsByStartLine]
  );

  const handleSelectAll = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
    },
    [containerRef]
  );

  const getSelectedCopyText = useCallback(() => {
    if (fullDocumentSelectedRef.current) {
      return text;
    }

    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const startElement = getLineTextElementFromNode(range.startContainer, container);
    const endElement = getLineTextElementFromNode(range.endContainer, container);
    if (!startElement || !endElement) {
      return null;
    }

    const startLine = getLineNumberFromElement(startElement);
    const endLine = getLineNumberFromElement(endElement);
    if (startLine === null || endLine === null || startLine > endLine) {
      return null;
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
      return selection.toString();
    }

    return copyText;
  }, [containerRef, getCopyTextForCollapsedSelection, text]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const key = event.key.toLowerCase();
      const isPrimaryShortcut = event.metaKey || event.ctrlKey;
      const isFind = key === 'f' && isPrimaryShortcut && !event.shiftKey && !event.altKey;

      if (isFind) {
        event.preventDefault();
        event.stopPropagation();
        onOpenFind();
        return;
      }

      const isCopy = key === 'c' && (event.altKey || isPrimaryShortcut) && !event.shiftKey;
      if (isCopy) {
        const copyText = getSelectedCopyText();
        if (copyText !== null) {
          event.preventDefault();
          event.stopPropagation();
          void writeTextToClipboard(copyText);
          return;
        }
      }

      handleSelectAll(event);
    },
    [getSelectedCopyText, handleSelectAll, onOpenFind]
  );

  const handleCopy = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      const copyText = getSelectedCopyText();

      if (copyText === null) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData('text/plain', copyText);
    },
    [getSelectedCopyText]
  );

  const resetFullDocumentSelection = useCallback(() => {
    fullDocumentSelectedRef.current = false;
  }, []);

  return {
    getLineSelectionRange,
    handleCopy,
    handleKeyDown,
    isLineSelected,
    resetFullDocumentSelection,
  };
}
