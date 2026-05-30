interface FoldableLineModel {
  getLineContent(lineNumber: number): string;
  getLineCount(): number;
}

export type FoldTargetMode = 'current' | 'parent';

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

function findParentFoldableLine(model: FoldableLineModel, lineNumber: number) {
  const safeLineNumber = Math.min(Math.max(1, Math.floor(lineNumber)), model.getLineCount());
  const currentLine = model.getLineContent(safeLineNumber);
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

export function getFoldableLineTargets(model: FoldableLineModel, lineNumber: number) {
  const safeLineNumber = Math.min(Math.max(1, Math.floor(lineNumber)), model.getLineCount());
  const currentLine = model.getLineContent(safeLineNumber);
  const currentLineTarget = hasUnquotedContainerOpen(currentLine) ? safeLineNumber : null;
  const parentLine = findParentFoldableLine(model, safeLineNumber);

  return {
    currentLine: currentLineTarget,
    parentLine,
    nearestLine: currentLineTarget ?? parentLine,
  };
}

export function findFoldableLineForMode(model: FoldableLineModel, lineNumber: number, mode: FoldTargetMode) {
  const targets = getFoldableLineTargets(model, lineNumber);
  return mode === 'current' ? (targets.currentLine ?? targets.parentLine) : (targets.parentLine ?? targets.currentLine);
}

export function findNearestFoldableLine(model: FoldableLineModel, lineNumber: number) {
  return getFoldableLineTargets(model, lineNumber).nearestLine;
}
