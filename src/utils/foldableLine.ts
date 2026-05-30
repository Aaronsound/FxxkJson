interface FoldableLineModel {
  getLineContent(lineNumber: number): string;
  getLineCount(): number;
}

function getIndentLength(line: string) {
  return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

function hasUnquotedContainerOpen(line: string) {
  let inString = false;
  let escaping = false;
  let lastStructuralChar = '';

  for (const char of line) {
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

    if (!/\s|,/.test(char)) {
      lastStructuralChar = char;
    }
  }

  return lastStructuralChar === '{' || lastStructuralChar === '[';
}

export function findNearestFoldableLine(model: FoldableLineModel, lineNumber: number) {
  const safeLineNumber = Math.min(Math.max(1, Math.floor(lineNumber)), model.getLineCount());
  const currentLine = model.getLineContent(safeLineNumber);

  if (hasUnquotedContainerOpen(currentLine)) {
    return safeLineNumber;
  }

  const currentIndent = getIndentLength(currentLine);
  for (let candidateLine = safeLineNumber - 1; candidateLine >= 1; candidateLine -= 1) {
    const line = model.getLineContent(candidateLine);
    if (!hasUnquotedContainerOpen(line)) {
      continue;
    }

    if (getIndentLength(line) < currentIndent) {
      return candidateLine;
    }
  }

  return null;
}
