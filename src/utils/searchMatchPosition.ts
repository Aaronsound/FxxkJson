export interface SearchPosition {
  lineNumber: number;
  column: number;
}

export interface SearchRangeLike {
  startLineNumber: number;
  startColumn: number;
}

export interface SearchOffsetModel {
  getLineCount: () => number;
  getLineMaxColumn: (lineNumber: number) => number;
  getOffsetAt: (position: SearchPosition) => number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getSafeOffsetAt(model: SearchOffsetModel, position: SearchPosition) {
  const lineCount = Math.max(model.getLineCount(), 1);
  const lineNumber = clamp(position.lineNumber, 1, lineCount);
  const maxColumn = Math.max(model.getLineMaxColumn(lineNumber), 1);
  const column = clamp(position.column, 1, maxColumn);

  return model.getOffsetAt({ lineNumber, column });
}

export function getRangeStartOffset(model: SearchOffsetModel, range: SearchRangeLike) {
  return getSafeOffsetAt(model, {
    lineNumber: range.startLineNumber,
    column: range.startColumn,
  });
}

export function findSearchIndexAtOrAfterOffset(
  model: SearchOffsetModel,
  ranges: SearchRangeLike[],
  anchorOffset: number | null | undefined
) {
  if (ranges.length === 0) {
    return 0;
  }

  if (anchorOffset === null || anchorOffset === undefined || Number.isNaN(anchorOffset)) {
    return 0;
  }

  const nextIndex = ranges.findIndex((range) => getRangeStartOffset(model, range) >= anchorOffset);
  return nextIndex >= 0 ? nextIndex : ranges.length - 1;
}
