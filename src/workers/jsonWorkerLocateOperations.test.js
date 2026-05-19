import { describe, expect, it } from 'vitest';
import { getLocateCandidateOffsets, getResolvedNodes } from './jsonWorkerLocateOperations';

describe('jsonWorkerLocateOperations', () => {
  it('includes nearby non-whitespace offsets on the same line', () => {
    const text = '{\n  "name": "demo"\n}';
    const offsets = getLocateCandidateOffsets(text, text.indexOf('"name"') - 1);

    expect(offsets).toContain(text.indexOf('"name"'));
  });

  it('resolves matching raw and formatted nodes', async () => {
    const { parseTree } = await import('jsonc-parser');
    const rawText = '{"name":"demo"}';
    const formattedText = '{\n  "name": "demo"\n}';
    const resolved = getResolvedNodes({
      rawTree: parseTree(rawText),
      formattedTree: parseTree(formattedText),
      formattedText,
    }, formattedText.indexOf('"demo"'));

    expect(resolved?.path).toEqual(['name']);
    expect(resolved?.leftNode.offset).toBe(rawText.indexOf('"demo"'));
  });
});
