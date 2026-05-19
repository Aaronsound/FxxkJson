import { describe, expect, it } from 'vitest';
import { getSearchRequestKey } from './jsonWorkerSearchOperations';

describe('jsonWorkerSearchOperations', () => {
  it('builds stable per-target request keys', () => {
    expect(getSearchRequestKey('tab-1', 'left')).toBe('left:tab-1');
    expect(getSearchRequestKey('tab-1', 'right')).toBe('right:tab-1');
  });
});
