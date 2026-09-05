import { createScanner, SyntaxKind } from 'jsonc-parser';

export class ExactJsonNumber {
  constructor(
    readonly raw: string,
    readonly canonical = normalizeJsonNumber(raw)
  ) {}
}
const FRACTION_OR_EXPONENT = /[.eE]/;
// Up to 15 significant decimal digits round-trip outside the subnormal/overflow
// range. This conservative text probe also accepts false positives in strings;
// only then do we inspect actual number tokens. No large exponent is expanded.
const POTENTIALLY_ROUNDED_NUMBER = /\d[\d.]{15}|[eE][+-]?0*(?:[2-9]\d{2}|[1-9]\d{3})/;

// Normalize decimal notation without rounding or expanding a potentially enormous exponent.
export function normalizeJsonNumber(raw: string): string {
  const [mantissa, exponent = '0'] = raw.toLowerCase().split('e');
  const negative = mantissa[0] === '-';
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const dot = unsigned.indexOf('.');
  const fractionLength = dot < 0 ? 0 : unsigned.length - dot - 1;
  const digits = unsigned.replace('.', '').replace(/^0+/, '');
  if (!digits) return negative ? '-0' : '0';
  const significant = digits.replace(/0+$/, '');
  const power = BigInt(exponent) - BigInt(fractionLength) + BigInt(digits.length - significant.length);
  return `${negative ? '-' : ''}${significant}e${power}`;
}

function needsExactNumber(raw: string): boolean {
  // Most business documents contain small integer IDs/counters: avoid normalization there.
  if (raw.length <= 15 && !FRACTION_OR_EXPONENT.test(raw)) return false;
  const number = Number(raw);
  return (
    !Number.isFinite(number) ||
    normalizeJsonNumber(raw) !== normalizeJsonNumber(Object.is(number, -0) ? '-0' : String(number))
  );
}

function hasRoundedNumbers(text: string) {
  if (!POTENTIALLY_ROUNDED_NUMBER.test(text)) return false;
  for (let offset = 0; offset < text.length; offset += 1) {
    if (text[offset] === '"') {
      // Skip whole string segments; escaped quotes do not terminate a JSON string.
      let end = offset;
      for (;;) {
        end = text.indexOf('"', end + 1);
        if (end < 0) return false; // JSON.parse validates syntax before this scan.
        let slashes = 0;
        for (let i = end - 1; i > offset && text[i] === '\\'; i -= 1) slashes += 1;
        if (slashes % 2 === 0) break;
      }
      offset = end;
    } else if (text[offset] === '-' || (text[offset] >= '0' && text[offset] <= '9')) {
      const start = offset;
      while (offset + 1 < text.length) {
        const code = text.charCodeAt(offset + 1);
        if ((code >= 48 && code <= 57) || code === 46 || code === 101 || code === 69 || code === 43 || code === 45)
          offset += 1;
        else break;
      }
      if (needsExactNumber(text.slice(start, offset + 1))) return true;
    }
  }
  return false;
}

export function parseComparisonJson(text: string): unknown {
  if (!text.trim()) throw new Error('内容为空');
  const nativeValue: unknown = JSON.parse(text);
  if (!hasRoundedNumbers(text)) return nativeValue;

  // Only documents that need lossless numbers take this path. Native parsing above
  // validates strict JSON; the scanner below builds it iteratively, without a recursive reviver.
  const scanner = createScanner(text, true);
  const frames: Array<{ value: unknown[] | Record<string, unknown>; key?: string }> = [];
  let root: unknown;
  const append = (value: unknown) => {
    const frame = frames.at(-1);
    if (!frame) root = value;
    else if (Array.isArray(frame.value)) frame.value.push(value);
    else {
      frame.value[frame.key as string] = value;
      frame.key = undefined;
    }
  };
  for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
    if (token === SyntaxKind.OpenBraceToken || token === SyntaxKind.OpenBracketToken) {
      const value = token === SyntaxKind.OpenBraceToken ? Object.create(null) : [];
      append(value);
      frames.push({ value });
    } else if (token === SyntaxKind.CloseBraceToken || token === SyntaxKind.CloseBracketToken) frames.pop();
    else if (token === SyntaxKind.StringLiteral) {
      const frame = frames.at(-1);
      if (frame && !Array.isArray(frame.value) && frame.key === undefined) frame.key = scanner.getTokenValue();
      else append(scanner.getTokenValue());
    } else if (token === SyntaxKind.NumericLiteral) {
      const raw = text.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength());
      append(needsExactNumber(raw) ? new ExactJsonNumber(raw) : Number(raw));
    } else if (token === SyntaxKind.TrueKeyword) append(true);
    else if (token === SyntaxKind.FalseKeyword) append(false);
    else if (token === SyntaxKind.NullKeyword) append(null);
  }
  return root;
}

export function comparisonScalarsEqual(left: unknown, right: unknown): boolean {
  if (left instanceof ExactJsonNumber || right instanceof ExactJsonNumber) {
    if (
      !(left instanceof ExactJsonNumber || typeof left === 'number') ||
      !(right instanceof ExactJsonNumber || typeof right === 'number')
    )
      return false;
    const canonical = (value: number | ExactJsonNumber) =>
      value instanceof ExactJsonNumber
        ? value.canonical
        : normalizeJsonNumber(Object.is(value, -0) ? '-0' : String(value));
    return canonical(left) === canonical(right);
  }
  return Object.is(left, right);
}

export function isComparisonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof ExactJsonNumber);
}

// Iterative serialization also supports deeply nested values. Preview generation
// consumes only the prefix, rather than serializing a multi-MB subtree first.
function* quotedStringChunks(value: string, limit: number) {
  yield '"';
  for (let start = 0; start < Math.min(value.length, limit); ) {
    let end = Math.min(start + 4096, value.length, limit);
    const before = value.charCodeAt(end - 1);
    const after = value.charCodeAt(end);
    if (end < limit && before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) end += 1;
    yield JSON.stringify(value.slice(start, end)).slice(1, -1);
    start = end;
  }
  yield '"';
}

export function* comparisonValueChunks(value: unknown, stringLimit = Infinity): Generator<string> {
  type Frame = { value: unknown[] | Record<string, unknown>; keys: string[] | null; index: number };
  const stack: Frame[] = [];
  let current = value;
  for (;;) {
    if (Array.isArray(current) || isComparisonObject(current)) {
      const array = Array.isArray(current);
      yield array ? '[' : '{';
      stack.push({ value: current, keys: array ? null : Object.keys(current), index: 0 });
    } else if (typeof current === 'string') {
      yield* quotedStringChunks(current, stringLimit);
    } else {
      yield current instanceof ExactJsonNumber
        ? current.raw
        : Object.is(current, -0)
          ? '-0'
          : (JSON.stringify(typeof current === 'string' ? current.slice(0, stringLimit) : current) ?? '');
    }
    let hasNext = false;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const length = frame.keys ? frame.keys.length : (frame.value as unknown[]).length;
      if (frame.index >= length) {
        yield frame.keys ? '}' : ']';
        stack.pop();
      } else {
        if (frame.index > 0) yield ',';
        const key = frame.keys ? frame.keys[frame.index] : frame.index;
        frame.index += 1;
        if (frame.keys) {
          yield* quotedStringChunks(String(key), stringLimit);
          yield ':';
        }
        current = (frame.value as Record<string | number, unknown>)[key];
        hasNext = true;
        break;
      }
    }
    if (!hasNext) return;
  }
}

export function serializeComparisonValue(value: unknown) {
  const parts: string[] = [];
  let batch: string[] = [];
  let length = 0;
  for (const chunk of comparisonValueChunks(value)) {
    batch.push(chunk);
    length += chunk.length;
    if (length >= 64 * 1024) {
      parts.push(batch.join(''));
      batch = [];
      length = 0;
    }
  }
  if (batch.length) parts.push(batch.join(''));
  return parts.join('');
}
