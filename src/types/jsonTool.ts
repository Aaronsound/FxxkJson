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
  formattedRawRevision: number;
}

export interface RenamingTabState {
  id: string;
  value: string;
}

export type WorkerRequestTextPayload = { text: string; textBuffer?: never } | { text?: never; textBuffer: ArrayBuffer };

interface WorkerRequestBase {
  requestId: number;
  tabId: string;
}

interface WorkerFormatOptions {
  buildViewer: boolean;
  deferStructure: boolean;
  enableDirectLocate: boolean;
  enableStructure: boolean;
  rawMetrics?: JsonDocumentMetrics;
  reuseText?: boolean;
  structureWarmupDelayMs?: number;
}

export interface WorkerSearchRequest {
  tabId: string;
  query: string;
  searchOptions: JsonSearchOptions;
  startOffset?: number;
  append?: boolean;
  target?: SearchTarget;
  text?: string;
  textByteLength?: number;
  rawRevision?: number;
}

export interface EditJsonWorkerRequest {
  tabId: string;
  operation: EditJsonWorkerOperation;
  text: string;
  textByteLength?: number;
  originalText?: string;
  originalTextByteLength?: number;
  rawRevision?: number;
  reuseOriginalText?: boolean;
  path?: JsonEditPath;
  offset?: number;
  searchTerm?: string;
  searchOptions?: JsonSearchOptions;
  replacement?: string;
  reuseText?: boolean;
}

export interface HydrateViewerCacheWorkerRequest {
  type: 'hydrate-viewer-cache';
  requestId: number;
  tabId: string;
  enableDirectLocate: boolean;
  formattedText?: string;
  formattedTextBuffer?: ArrayBuffer;
  rawText?: string;
  rawTextBuffer?: ArrayBuffer;
  rawRevision?: number;
  viewerData: LargeJsonLineIndex;
}

type WorkerFormatTextPayload = WorkerRequestTextPayload | { reuseText: true; text?: never; textBuffer?: never };

export type WorkerRequestMessage =
  | { type: 'clear-locate-cache'; tabId: string }
  | { type: 'clear-tab-cache'; tabId: string }
  | { type: 'release-transient-cache'; tabId: string }
  | HydrateViewerCacheWorkerRequest
  | (WorkerRequestBase & WorkerFormatTextPayload & WorkerFormatOptions & { type: 'format'; rawRevision?: number })
  | (WorkerRequestBase & WorkerRequestTextPayload & WorkerFormatOptions & { type: 'repair'; rawRevision?: number })
  | (WorkerRequestBase & {
      type: 'search';
      target: SearchTarget;
      query: WorkerSearchRequest['query'];
      searchOptions: WorkerSearchRequest['searchOptions'];
      startOffset: number;
      append: boolean;
      text?: WorkerSearchRequest['text'];
      textBuffer?: ArrayBuffer;
      textByteLength?: WorkerSearchRequest['textByteLength'];
      rawRevision?: WorkerSearchRequest['rawRevision'];
    })
  | (WorkerRequestBase & { type: 'locate'; offset: number })
  | (WorkerRequestBase & { type: 'locate-right-direct'; offset: number })
  | (WorkerRequestBase & {
      type: 'edit-json';
      operation: EditJsonWorkerRequest['operation'];
      text?: EditJsonWorkerRequest['text'];
      textBuffer?: ArrayBuffer;
      textByteLength?: EditJsonWorkerRequest['textByteLength'];
      originalText?: EditJsonWorkerRequest['originalText'];
      originalTextBuffer?: ArrayBuffer;
      originalTextByteLength?: EditJsonWorkerRequest['originalTextByteLength'];
      rawRevision?: EditJsonWorkerRequest['rawRevision'];
      path?: EditJsonWorkerRequest['path'];
      offset?: EditJsonWorkerRequest['offset'];
      searchTerm?: EditJsonWorkerRequest['searchTerm'];
      searchOptions?: EditJsonWorkerRequest['searchOptions'];
      replacement?: EditJsonWorkerRequest['replacement'];
      reuseText?: EditJsonWorkerRequest['reuseText'];
    });

export interface WorkerMessage {
  type:
    | 'format-result'
    | 'repair-result'
    | 'raw-viewer-ready'
    | 'structure-ready'
    | 'locate-result'
    | 'viewer-ready'
    | 'search-result'
    | 'edit-json-result'
    | 'viewer-cache-evicted'
    | 'viewer-cache-restored';
  requestId: number;
  tabId: string;
  target?: SearchTarget;
  operation?: EditJsonWorkerOperation;
  success?: boolean;
  ready?: boolean;
  found?: boolean;
  data?: string;
  dataBuffer?: ArrayBuffer;
  repairedText?: string;
  repairedTextBuffer?: ArrayBuffer;
  formattedText?: string;
  formattedTextBuffer?: ArrayBuffer;
  rawPatch?: JsonTextPatch;
  formattedPatch?: JsonTextPatch;
  viewerPatchApplied?: boolean;
  requiresOriginalText?: boolean;
  requiresText?: boolean;
  rawMetrics?: JsonDocumentMetrics;
  formattedMetrics?: JsonDocumentMetrics;
  formattedMatchesRaw?: boolean;
  structureWarming?: boolean;
  value?: string | null;
  error?: string;
  startOffset?: number;
  endOffset?: number;
  rightStartOffset?: number;
  rightEndOffset?: number;
  rightOnly?: boolean;
  path?: JsonEditPath;
  pathText?: string | null;
  viewerData?: LargeJsonViewerData | null;
  rawViewerData?: LargeRawViewerData | null;
  viewerIndexMs?: number | null;
  query?: string;
  matches?: LargeJsonSearchMatch[];
  matchData?: Uint32Array;
  hasMore?: boolean;
  nextStartOffset?: number;
  append?: boolean;
}

export type JsonEditPath = Array<string | number>;
export interface JsonTextPatch {
  sourceLength: number;
  startOffset: number;
  endOffset: number;
  text: string;
}
export type EditJsonWorkerOperation =
  | 'format'
  | 'save'
  | 'copy-literal'
  | 'escape-json'
  | 'unescape-json'
  | 'read-node'
  | 'save-node'
  | 'delete-node'
  | 'rename-node-key'
  | 'replace-text';
export type SearchTarget = 'left' | 'right';
export type StructureStatus = 'ready' | 'building' | 'disabled';
export type PerformanceTrigger = 'import' | 'manual-format' | 'repair' | 'edit-save' | 'paste';
export type PerformanceSnapshotStatus = 'running' | 'ready' | 'failed';
export type LargeViewerStatus = 'idle' | 'building' | 'ready';
export type ProcessingStage =
  | 'idle'
  | 'reading'
  | 'syncing-left'
  | 'formatting'
  | 'repairing'
  | 'building-viewer'
  | 'building-index';

export interface LargeJsonViewerRegion {
  startLine: number;
  endLine: number;
  kind: 'object' | 'array';
}

export interface LargeJsonViewerRegions {
  startLines: Uint32Array;
  endLines: Uint32Array;
  parentIndexes: Int32Array;
  kinds: Uint8Array;
}

export interface LargeJsonLineIndex {
  lineStarts: Uint32Array;
  lineCount: number;
  literalChunks?: boolean;
}

export const EMPTY_LARGE_JSON_VIEWER_REGIONS: LargeJsonViewerRegions = {
  startLines: new Uint32Array(0),
  endLines: new Uint32Array(0),
  parentIndexes: new Int32Array(0),
  kinds: new Uint8Array(0),
};

export interface LargeJsonViewerData extends LargeJsonLineIndex {
  literalChunks?: boolean;
  regions: LargeJsonViewerRegions;
}

export interface JsonDocumentMetrics {
  exceedsDedicatedViewerLineThreshold: boolean;
  lineCount: number;
  textByteLength: number;
}

export type LargeJsonFoldState = { mode: 'explicit'; lines: number[] } | { mode: 'all-except'; lines: number[] };

export const EMPTY_LARGE_JSON_FOLD_STATE: LargeJsonFoldState = { mode: 'explicit', lines: [] };

export interface LargeRawViewerData {
  starts: Uint32Array;
  lineNumbers: Uint32Array;
  lengths: Uint16Array;
  syntaxStates: Uint8Array;
  rowCount: number;
}

export interface LargeJsonSearchMatch {
  start: number;
  end: number;
  lineNumber: number;
  lineStartOffset: number;
  localStart: number;
  localEnd: number;
  matchIndex?: number;
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

export interface RightNodeSelection {
  path: JsonEditPath | null;
  pathText: string | null;
  startOffset: number;
  endOffset: number;
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
export const DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD = 50_000;
export const SEARCH_HIGHLIGHT_DURATION = 4000;
export const SEARCH_BATCH_SIZE = 2000;
export const FORMAT_DEBOUNCE_MS = 120;
export const LARGE_FILE_FORMAT_DEBOUNCE_MS = 1200;
export const EDIT_SAVE_FORMAT_DELAY_MS = 160;

export const EMPTY_DOCUMENT_META: TabDocumentMeta = {
  rawLength: 0,
  formattedLength: 0,
  rawRevision: 0,
  formattedRevision: 0,
  formattedRawRevision: 0,
};
