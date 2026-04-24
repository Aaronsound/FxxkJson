export interface Tab {
  id: string;
  title: string;
}

export interface TabDocumentMeta {
  // Stored as UTF-8 byte lengths so imported file sizes and in-app thresholds match.
  rawLength: number;
  formattedLength: number;
  formattedRevision: number;
}

export interface RenamingTabState {
  id: string;
  value: string;
}

export interface WorkerMessage {
  type: 'format-result' | 'structure-ready' | 'locate-result' | 'value-result' | 'viewer-ready';
  requestId: number;
  tabId: string;
  success?: boolean;
  ready?: boolean;
  found?: boolean;
  data?: string;
  value?: string | null;
  error?: string;
  startOffset?: number;
  endOffset?: number;
  viewerData?: LargeJsonViewerData | null;
}

export type StructureStatus = 'ready' | 'building' | 'disabled';
export type PerformanceTrigger = 'import' | 'manual-format' | 'edit-save';
export type PerformanceSnapshotStatus = 'running' | 'ready' | 'failed';
export type LargeViewerStatus = 'idle' | 'building' | 'ready';

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

export interface PerformanceSnapshot {
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
  totalToFormattedMs: number | null;
  structureIndexMs: number | null;
  updatedAt: number;
  status: PerformanceSnapshotStatus;
  error: string | null;
}

export const DEFAULT_TAB_TITLE = 'newTab';
export const INITIAL_TAB_ID = 'tab-1';
export const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;
export const STRUCTURE_SYNC_THRESHOLD = 20 * 1024 * 1024;
export const DEDICATED_RIGHT_VIEWER_THRESHOLD = 10 * 1024 * 1024;
export const DEDICATED_RIGHT_VIEWER_LINE_THRESHOLD = 300000;
export const SEARCH_HIGHLIGHT_DURATION = 1500;
export const FORMAT_DEBOUNCE_MS = 120;
export const LARGE_FILE_FORMAT_DEBOUNCE_MS = 1200;

export const EMPTY_DOCUMENT_META: TabDocumentMeta = {
  rawLength: 0,
  formattedLength: 0,
  formattedRevision: 0,
};
