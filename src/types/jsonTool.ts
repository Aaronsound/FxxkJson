export interface Tab {
  id: string;
  title: string;
}

export interface TabDocumentMeta {
  // Stored as UTF-8 byte lengths so imported file sizes and in-app thresholds match.
  rawLength: number;
  formattedLength: number;
  rawRevision: number;
  formattedRevision: number;
}

export interface RenamingTabState {
  id: string;
  value: string;
}

export interface WorkerMessage {
  type: 'format-result' | 'structure-ready' | 'locate-result' | 'value-result' | 'viewer-ready' | 'search-result' | 'edit-json-result';
  requestId: number;
  tabId: string;
  target?: SearchTarget;
  operation?: EditJsonWorkerOperation;
  success?: boolean;
  ready?: boolean;
  found?: boolean;
  data?: string;
  value?: string | null;
  error?: string;
  startOffset?: number;
  endOffset?: number;
  viewerData?: LargeJsonViewerData | null;
  viewerIndexMs?: number | null;
  query?: string;
  matches?: LargeJsonSearchMatch[];
  hasMore?: boolean;
  nextStartOffset?: number;
  append?: boolean;
}

export type EditJsonWorkerOperation = 'format' | 'save' | 'copy-literal';
export type SearchTarget = 'left' | 'right';
export type StructureStatus = 'ready' | 'building' | 'disabled';
export type PerformanceTrigger = 'import' | 'manual-format' | 'edit-save' | 'paste';
export type PerformanceSnapshotStatus = 'running' | 'ready' | 'failed';
export type LargeViewerStatus = 'idle' | 'building' | 'ready';
export type ProcessingStage = 'idle' | 'reading' | 'syncing-left' | 'formatting' | 'building-viewer' | 'building-index';

export interface LargeJsonViewerRegion {
  startLine: number;
  endLine: number;
  kind: 'object' | 'array';
}

export interface LargeJsonViewerData {
  lineStarts: Uint32Array;
  regions: LargeJsonViewerRegion[];
  lineCount: number;
}

export interface LargeJsonSearchMatch {
  start: number;
  end: number;
  lineNumber: number;
  lineStartOffset: number;
  localStart: number;
  localEnd: number;
}

export interface JsonSearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface LocateFeedback {
  status: 'pending' | 'success' | 'failed';
  message: string;
  startOffset?: number;
  endOffset?: number;
  updatedAt: number;
}

export const DEFAULT_SEARCH_OPTIONS: JsonSearchOptions = {
  matchCase: false,
  wholeWord: false,
  useRegex: false,
};

export interface PerformanceSnapshot {
  runId: string;
  trigger: PerformanceTrigger;
  sourceLabel: string;
  fileSizeBytes: number | null;
  rawBytes: number;
  formattedBytes: number;
  largeMode: boolean;
  structureEnabled: boolean;
  readFileMs: number | null;
  leftModelSyncMs: number | null;
  formatQueueMs: number | null;
  formatWorkerMs: number | null;
  rightModelSyncMs: number | null;
  viewerIndexMs: number | null;
  totalToFormattedMs: number | null;
  totalToViewerReadyMs: number | null;
  structureIndexMs: number | null;
  updatedAt: number;
  status: PerformanceSnapshotStatus;
  error: string | null;
}

export const DEFAULT_TAB_TITLE = 'newTab';
export const INITIAL_TAB_ID = 'tab-1';
export const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;
// Keep nominal 20 MB imports inside the supported locate range when file
// sizes are reported with binary rounding.
export const STRUCTURE_SYNC_THRESHOLD = 21 * 1024 * 1024;
export const DEDICATED_RIGHT_VIEWER_THRESHOLD = LARGE_FILE_THRESHOLD;
export const DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD = 0;
export const SEARCH_HIGHLIGHT_DURATION = 4000;
export const SEARCH_BATCH_SIZE = 2000;
export const FORMAT_DEBOUNCE_MS = 120;
export const LARGE_FILE_FORMAT_DEBOUNCE_MS = 1200;

export const EMPTY_DOCUMENT_META: TabDocumentMeta = {
  rawLength: 0,
  formattedLength: 0,
  rawRevision: 0,
  formattedRevision: 0,
};
