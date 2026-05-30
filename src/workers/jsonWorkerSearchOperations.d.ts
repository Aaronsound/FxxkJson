import type { LargeJsonSearchMatch, LargeJsonViewerData, WorkerMessage, WorkerSearchRequest } from '../types/jsonTool';

type SearchRequestMessage = WorkerSearchRequest & {
  append?: boolean;
  requestId: number;
  startOffset?: number;
  type?: 'search';
};
type SearchResultMessage = Extract<WorkerMessage, { type: 'search-result' }>;

interface RawSearchCacheEntry {
  lineStarts: Uint32Array | null;
  lowerRawText: string | null;
  rawRevision: number | null;
  rawText: string;
}

interface ViewerSearchCacheEntry {
  formattedText: string;
  lowerFormattedText?: string | null;
  viewerData: LargeJsonViewerData;
}

export function getSearchRequestKey(tabId: string, target: 'left' | 'right'): string;

export function createJsonWorkerSearchOperations(args: {
  latestSearchRequestByKey: Map<string, number>;
  rawSearchCache: Map<string, RawSearchCacheEntry>;
  viewerCache: Map<string, ViewerSearchCacheEntry>;
}): {
  handleSearchMessage(message: SearchRequestMessage): void;
  isLatestSearchRequest(tabId: string, target: 'left' | 'right', requestId: number): boolean;
};

export type { RawSearchCacheEntry, SearchRequestMessage, SearchResultMessage, ViewerSearchCacheEntry };
