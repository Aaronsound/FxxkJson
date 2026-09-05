// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { countTextLines } from './bench-json-metrics.mjs';
import { measureJsonDocumentWithKnownByteLength } from '../src/utils/jsonDocumentMetrics';

describe('benchmark / production line-count parity', () => {
  it.each([
    '',
    '{}',
    '\n',
    '\r\n',
    '\r',
    '{"x":"\\n"}',
    '{\r\n"中文":"🌍"\r\n}',
    'a\n\nb\n',
    'x'.repeat(200000) + '\nend',
  ])('counts the same LF-delimited lines as the worker (%#)', (text) => {
    const bytes = new TextEncoder().encode(text);
    expect(countTextLines(text)).toBe(measureJsonDocumentWithKnownByteLength(text, bytes.byteLength).lineCount);
    expect(countTextLines(text)).toBe(text.split('\n').length);
  });
});
