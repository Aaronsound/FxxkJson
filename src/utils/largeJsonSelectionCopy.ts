import type { LargeJsonViewerRegion } from '../types/jsonTool';

interface CollapsedSelectionTextArgs {
  getLineText: (lineNumber: number) => string;
  lineNumber: number;
  regionsByStartLine: Map<number, LargeJsonViewerRegion>;
  startOffset: number;
}

export function getCollapsedSelectionText({
  getLineText,
  lineNumber,
  regionsByStartLine,
  startOffset,
}: CollapsedSelectionTextArgs) {
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
}

interface CopyTextForCollapsedSelectionArgs {
  collapsedLineSet: Set<number>;
  endLine: number;
  endOffset: number;
  getLineText: (lineNumber: number) => string;
  regionsByStartLine: Map<number, LargeJsonViewerRegion>;
  startLine: number;
  startOffset: number;
}

export function getCopyTextForCollapsedSelection({
  collapsedLineSet,
  endLine,
  endOffset,
  getLineText,
  regionsByStartLine,
  startLine,
  startOffset,
}: CopyTextForCollapsedSelectionArgs) {
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
    return getCollapsedSelectionText({
      getLineText,
      lineNumber: startLine,
      regionsByStartLine,
      startOffset,
    });
  }

  const parts: string[] = [];
  let lineNumber = startLine;

  while (lineNumber <= endLine) {
    if (collapsedLineSet.has(lineNumber)) {
      const region = regionsByStartLine.get(lineNumber);
      if (region) {
        parts.push(
          getCollapsedSelectionText({
            getLineText,
            lineNumber,
            regionsByStartLine,
            startOffset: lineNumber === startLine ? startOffset : 0,
          })
        );
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
}
