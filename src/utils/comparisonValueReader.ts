import { comparisonValueChunks, serializeComparisonValue } from './jsonComparisonValues';

const BLOCK = 4096;
const PREFIX_LIMIT = 16386;
// biome-ignore lint/suspicious/noControlCharactersInRegex: JSON requires escaping U+0000–U+001F; lone surrogates must also use JSON.stringify.
const NEEDS_ESCAPING = /["\\\u0000-\u001f\ud800-\udfff]/;
const encode = (text: string) => (NEEDS_ESCAPING.test(text) ? JSON.stringify(text).slice(1, -1) : text);
const high = (code: number) => code >= 0xd800 && code <= 0xdbff;
const low = (code: number) => code >= 0xdc00 && code <= 0xdfff;

export interface ComparisonValueReader {
  total: number;
  slice(start: number, end: number): string;
  full(): string;
}

// Index source blocks, not escaped output: a 20 MB ASCII string needs roughly 60 KB
// of offsets instead of another complete escaped string. Each read encodes only
// the requested blocks. Preserve surrogate pairs when splitting the source.
function stringReader(value: string): ComparisonValueReader {
  const capacity = Math.ceil(value.length / BLOCK) + 1;
  const source = new Uint32Array(capacity);
  const output = new Float64Array(capacity);
  let count = 0;
  let total = 1;
  for (let start = 0; start < value.length; ) {
    let end = Math.min(start + BLOCK, value.length);
    if (high(value.charCodeAt(end - 1)) && low(value.charCodeAt(end))) end += 1;
    source[count] = start;
    output[count++] = total;
    total += encode(value.slice(start, end)).length;
    start = end;
  }
  source[count] = value.length;
  output[count] = total;
  total += 1;
  return {
    total,
    full: () => JSON.stringify(value),
    slice(start, end) {
      start = Math.max(0, start);
      end = Math.min(total, end);
      if (end <= start) return '';
      const parts: string[] = [];
      if (start === 0) parts.push('"');
      let lo = 0;
      let hi = count;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (output[mid] <= start) lo = mid;
        else hi = mid - 1;
      }
      for (let i = lo; i < count && output[i] < end; i++) {
        parts.push(
          encode(value.slice(source[i], source[i + 1])).slice(Math.max(0, start - output[i]), end - output[i])
        );
      }
      if (end === total) parts.push('"');
      return parts.join('');
    },
  };
}

export function createComparisonValueReader(value: unknown): ComparisonValueReader {
  if (typeof value === 'string') return stringReader(value);
  let total = 0;
  let prefix = '';
  for (const chunk of comparisonValueChunks(value)) {
    if (prefix.length < PREFIX_LIMIT) prefix += chunk.slice(0, PREFIX_LIMIT - prefix.length);
    total += chunk.length;
  }
  let cursor = comparisonValueChunks(value);
  let chunk = '';
  let chunkStart = 0;
  return {
    total,
    full: () => serializeComparisonValue(value),
    slice(start, end) {
      start = Math.max(0, start);
      end = Math.min(total, end);
      if (end <= prefix.length) return prefix.slice(start, end);
      if (start < chunkStart) {
        cursor = comparisonValueChunks(value);
        chunk = '';
        chunkStart = 0;
      }
      const parts: string[] = [];
      while (chunkStart < end) {
        if (chunkStart + chunk.length > start)
          parts.push(chunk.slice(Math.max(0, start - chunkStart), end - chunkStart));
        if (chunkStart + chunk.length >= end) break;
        chunkStart += chunk.length;
        const next = cursor.next();
        if (next.done) break;
        chunk = next.value;
      }
      return parts.join('');
    },
  };
}
