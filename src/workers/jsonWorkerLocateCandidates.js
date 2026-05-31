export function getLocateCandidateOffsets(text, offset) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const lineStart = text.lastIndexOf('\n', Math.max(0, safeOffset - 1)) + 1;
  const nextLineBreak = text.indexOf('\n', safeOffset);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
  const candidates = [safeOffset, Math.max(0, safeOffset - 1), Math.min(text.length, safeOffset + 1)];

  let firstNonWhitespace = lineStart;
  while (firstNonWhitespace < lineEnd && /\s/.test(text[firstNonWhitespace])) {
    firstNonWhitespace += 1;
  }

  if (firstNonWhitespace < lineEnd) {
    candidates.push(firstNonWhitespace);
  }

  let nextNonWhitespace = safeOffset;
  while (nextNonWhitespace < lineEnd && /\s/.test(text[nextNonWhitespace])) {
    nextNonWhitespace += 1;
  }

  if (nextNonWhitespace < lineEnd) {
    candidates.push(nextNonWhitespace);
  }

  let previousNonWhitespace = Math.min(safeOffset - 1, lineEnd - 1);
  while (previousNonWhitespace >= lineStart && /\s/.test(text[previousNonWhitespace])) {
    previousNonWhitespace -= 1;
  }

  if (previousNonWhitespace >= lineStart) {
    candidates.push(previousNonWhitespace);
  }

  return candidates.filter(
    (candidate, index, values) => candidate >= 0 && candidate <= text.length && values.indexOf(candidate) === index
  );
}
