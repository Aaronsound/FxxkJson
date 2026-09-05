export interface JsonErrorLocation {
  offset: number;
  length: number;
  line: number;
  column: number;
  rawRevision: number;
}

/** Carries validation details without loading a JSON parser in the renderer. */
export class JsonValidationError extends Error {
  constructor(
    message: string,
    readonly location?: JsonErrorLocation
  ) {
    super(message);
    this.name = 'JsonValidationError';
  }
}

export function getErrorHighlightRange(text: string, error: JsonErrorLocation) {
  let start = Math.min(text.length, Math.max(0, error.offset));
  // A malformed string token can span megabytes: mark nearby context, not the entire token.
  let end = Math.min(text.length, start + Math.max(1, Math.min(80, error.length)));
  // EOF has no character to mark: highlight its preceding character as context.
  if (start === text.length) start = Math.max(0, start - 1);
  const splitsPair = (offset: number) => {
    const before = text.charCodeAt(offset - 1);
    const after = text.charCodeAt(offset);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
  };
  if (splitsPair(start)) start -= 1;
  if (splitsPair(end)) end += 1;
  return { start, end };
}
