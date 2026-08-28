// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { releaseJsonWorkerTransientCaches } from './jsonWorkerCacheLifecycle';

describe('releaseJsonWorkerTransientCaches', () => {
  it('releases only the inactive tab transient entries', () => {
    const editJsonCache = new Map<string, unknown>([
      ['tab-a', { originalText: 'large-a' }],
      ['tab-b', { originalText: 'large-b' }],
    ]);
    const nodeEditCache = new Map<string, unknown>([
      ['tab-a', { formattedText: 'formatted-a' }],
      ['tab-b', { formattedText: 'formatted-b' }],
    ]);
    const rawSearchCache = new Map<string, unknown>([
      ['tab-a', { rawText: 'search-a' }],
      ['tab-b', { rawText: 'search-b' }],
    ]);
    const rawDocumentCache = new Map<string, unknown>([
      ['tab-a', { rawText: 'document-a' }],
      ['tab-b', { rawText: 'document-b' }],
    ]);
    const cancelInteractiveRequests = vi.fn();

    releaseJsonWorkerTransientCaches('tab-a', {
      cancelInteractiveRequests,
      editJsonCache,
      nodeEditCache,
      rawDocumentCache,
      rawSearchCache,
    });

    expect(editJsonCache.has('tab-a')).toBe(false);
    expect(nodeEditCache.has('tab-a')).toBe(false);
    expect(rawDocumentCache.has('tab-a')).toBe(false);
    expect(rawSearchCache.has('tab-a')).toBe(false);
    expect(editJsonCache.has('tab-b')).toBe(true);
    expect(nodeEditCache.has('tab-b')).toBe(true);
    expect(rawDocumentCache.has('tab-b')).toBe(true);
    expect(rawSearchCache.has('tab-b')).toBe(true);
    expect(cancelInteractiveRequests).toHaveBeenCalledOnce();
    expect(cancelInteractiveRequests).toHaveBeenCalledWith('tab-a');
  });
});
