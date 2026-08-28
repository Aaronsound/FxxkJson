interface JsonWorkerTransientCaches {
  editJsonCache: Map<string, unknown>;
  nodeEditCache: Map<string, unknown>;
  rawDocumentCache: Map<string, unknown>;
  rawSearchCache: Map<string, unknown>;
}

interface ReleaseJsonWorkerTransientCachesArgs extends JsonWorkerTransientCaches {
  cancelInteractiveRequests: (tabId: string) => void;
}

export function releaseJsonWorkerTransientCaches(
  tabId: string,
  {
    cancelInteractiveRequests,
    editJsonCache,
    nodeEditCache,
    rawDocumentCache,
    rawSearchCache,
  }: ReleaseJsonWorkerTransientCachesArgs
) {
  editJsonCache.delete(tabId);
  nodeEditCache.delete(tabId);
  rawDocumentCache.delete(tabId);
  rawSearchCache.delete(tabId);
  cancelInteractiveRequests(tabId);
}
