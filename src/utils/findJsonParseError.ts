import { visit } from 'jsonc-parser';
import type { JsonErrorLocation } from './jsonErrorLocation';

// Used only after formatting has failed. No syntax tree or extra pass for valid JSON.
export function findJsonParseError(text: string, rawRevision: number): JsonErrorLocation | undefined {
  let error: { offset: number; length: number } | undefined;
  const stop = {};
  try {
    visit(
      text,
      {
        onError(_code, offset, length) {
          error = { offset, length };
          throw stop;
        },
      },
      { allowTrailingComma: false, disallowComments: true, allowEmptyContent: false }
    );
  } catch (caught) {
    // A diagnostic failure must never replace the original formatting error.
    if (caught !== stop) return undefined;
  }
  if (!error) return undefined;
  const offset = Math.min(text.length, Math.max(0, error.offset));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    const code = text.charCodeAt(i);
    if (code === 13 || code === 10) {
      if (code === 13 && text.charCodeAt(i + 1) === 10 && i + 1 < offset) i++;
      line++;
      lineStart = i + 1;
    }
  }
  return { offset, length: error.length, line, column: offset - lineStart + 1, rawRevision };
}
