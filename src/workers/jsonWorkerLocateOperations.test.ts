import { parseTree } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { getLocateCandidateOffsets, getResolvedNodes } from './jsonWorkerLocateOperations';
import { getRightOnlyLocateResult } from './jsonWorkerLocateRanges';

describe('jsonWorkerLocateOperations', () => {
  it('includes nearby non-whitespace offsets on the same line', () => {
    const text = '{\n  "name": "demo"\n}';
    const offsets = getLocateCandidateOffsets(text, text.indexOf('"name"') - 1);

    expect(offsets).toContain(text.indexOf('"name"'));
  });

  it('resolves matching raw and formatted nodes', () => {
    const rawText = '{"name":"demo"}';
    const formattedText = '{\n  "name": "demo"\n}';
    const resolved = getResolvedNodes(
      {
        rawTree: parseTree(rawText),
        formattedTree: parseTree(formattedText),
        formattedText,
      },
      formattedText.indexOf('"demo"')
    );

    expect(resolved?.path).toEqual(['name']);
    expect(resolved?.leftNode.offset).toBe(rawText.indexOf('"demo"'));
  });

  it('returns a right-only locate result from direct formatted text', () => {
    const formattedText = '{\n  "name": "demo"\n}';
    const result = getRightOnlyLocateResult(
      'tab-a',
      7,
      formattedText.indexOf('"demo"'),
      { requestId: 6, formattedText },
      (_tabId, _requestId, text) => parseTree(text)
    );

    expect(result).toMatchObject({
      found: true,
      path: ['name'],
      requestId: 7,
      rightOnly: true,
      tabId: 'tab-a',
      type: 'locate-result',
    });
    expect(result.rightStartOffset).toBe(formattedText.indexOf('"demo"'));
  });

  it('returns not found for right-only locate when formatted text is unavailable', () => {
    expect(getRightOnlyLocateResult('tab-a', 7, 0, null, () => undefined)).toMatchObject({
      found: false,
      requestId: 7,
      rightOnly: true,
      tabId: 'tab-a',
      type: 'locate-result',
    });
  });
});
