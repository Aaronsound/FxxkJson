// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getFirstMeaningfulOffset, getLargeJsonLineTitle, getLineNumberForOffset } from './largeJsonViewerDom';

describe('largeJsonViewerDom', () => {
  it('maps document offsets back to virtual JSON lines', () => {
    expect(getLineNumberForOffset(new Uint32Array([0, 4, 12]), 0)).toBe(1);
    expect(getLineNumberForOffset(new Uint32Array([0, 4, 12]), 10)).toBe(2);
    expect(getLineNumberForOffset(new Uint32Array([0, 4, 12]), 20)).toBe(3);
  });

  it('keeps visible line labels and titles bounded', () => {
    expect(getFirstMeaningfulOffset('    "name": 1')).toBe(4);
    expect(getLargeJsonLineTitle('short')).toBe('short');
    expect(getLargeJsonLineTitle('x'.repeat(2000))).toHaveLength(1003);
  });
});
