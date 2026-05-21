// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildLargeViewerData } from './largeJsonViewerData';
import { getIdentityLocateRange, getLightweightTokenLocateRange } from './lightweightLocate';

function buildData(text: string) {
  const data = buildLargeViewerData(text, 1);
  if (!data) {
    throw new Error('Expected viewer data');
  }
  return data;
}

describe('lightweightLocate', () => {
  it('maps a formatted token back to minified raw JSON', () => {
    const rawText = '{"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}';
    const formattedText = JSON.stringify(JSON.parse(rawText), null, 2);
    const range = getLightweightTokenLocateRange(
      rawText,
      formattedText,
      buildData(formattedText),
      formattedText.indexOf('"beta"')
    );

    expect(range).not.toBeNull();
    expect(rawText.slice(range!.startOffset, range!.endOffset)).toBe('"beta"');
  });

  it('uses token occurrence order for repeated keys', () => {
    const rawText = '{"items":[{"id":1},{"id":2}]}';
    const formattedText = JSON.stringify(JSON.parse(rawText), null, 2);
    const firstIdOffset = formattedText.indexOf('"id"');
    const secondIdOffset = formattedText.indexOf('"id"', firstIdOffset + 1);
    const firstRawIdOffset = rawText.indexOf('"id"');
    const secondRawIdOffset = rawText.indexOf('"id"', firstRawIdOffset + 1);
    const range = getLightweightTokenLocateRange(rawText, formattedText, buildData(formattedText), secondIdOffset);

    expect(range).not.toBeNull();
    expect(range!.startOffset).toBe(secondRawIdOffset);
  });

  it('reuses cached token offsets for repeated lightweight locates', () => {
    const rawText = '{"items":[{"request":1},{"request":2},{"request":3}]}';
    const formattedText = JSON.stringify(JSON.parse(rawText), null, 2);
    const secondRequestOffset = formattedText.indexOf('"request"', formattedText.indexOf('"request"') + 1);
    const thirdRequestOffset = formattedText.indexOf('"request"', secondRequestOffset + 1);
    const secondRawRequestOffset = rawText.indexOf('"request"', rawText.indexOf('"request"') + 1);
    const thirdRawRequestOffset = rawText.indexOf('"request"', secondRawRequestOffset + 1);
    const cache = { tokenOffsetsByToken: new Map() };

    const secondRange = getLightweightTokenLocateRange(
      rawText,
      formattedText,
      buildData(formattedText),
      secondRequestOffset,
      cache
    );
    const thirdRange = getLightweightTokenLocateRange(
      rawText,
      formattedText,
      buildData(formattedText),
      thirdRequestOffset,
      cache
    );
    const cacheSizeAfterThirdLocate = cache.tokenOffsetsByToken.size;
    const repeatedThirdRange = getLightweightTokenLocateRange(
      rawText,
      formattedText,
      buildData(formattedText),
      thirdRequestOffset,
      cache
    );

    expect(secondRange?.startOffset).toBe(secondRawRequestOffset);
    expect(thirdRange?.startOffset).toBe(thirdRawRequestOffset);
    expect(repeatedThirdRange?.startOffset).toBe(thirdRawRequestOffset);
    expect(cache.tokenOffsetsByToken.has('"request"')).toBe(true);
    expect(cache.tokenOffsetsByToken.size).toBe(cacheSizeAfterThirdLocate);
  });

  it('keeps identity direct locate on the active formatted line', () => {
    const text = ['{', '  "name": "alpha"', '}'].join('\n');
    const range = getIdentityLocateRange(text.length, buildData(text), text.indexOf('"alpha"'));

    expect(text.slice(range.startOffset, range.endOffset)).toBe('  "name": "alpha"');
  });
});
