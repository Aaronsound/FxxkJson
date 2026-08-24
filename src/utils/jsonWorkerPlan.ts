import { DEDICATED_RIGHT_VIEWER_THRESHOLD, STRUCTURE_SYNC_THRESHOLD } from '../types/jsonTool';
import { type JsonDocumentMetrics, measureJsonDocument, shouldUseLargeModeForMetrics } from './jsonDocumentMetrics';

export interface JsonWorkerProcessingPlan {
  textByteLength: number;
  largeMode: boolean;
  shouldBuildStructureIndex: boolean;
  shouldAttemptDirectLocate: boolean;
  workerLocateEnabled: boolean;
  shouldDeferStructureIndex: boolean;
  shouldBuildLargeViewer: boolean;
  deferredStructureWarmupDelayMs: number;
}

export const DEFERRED_STRUCTURE_WARMUP_DELAY_MS = 350;
const LARGE_STRUCTURE_WARMUP_THRESHOLD = 10 * 1024 * 1024;
const EXTRA_LARGE_STRUCTURE_WARMUP_THRESHOLD = 16 * 1024 * 1024;
const LARGE_STRUCTURE_WARMUP_DELAY_MS = 900;
const EXTRA_LARGE_STRUCTURE_WARMUP_DELAY_MS = 1600;

export function getDeferredStructureWarmupDelayMs(
  textByteLength: number,
  baseDelayMs = DEFERRED_STRUCTURE_WARMUP_DELAY_MS
) {
  if (textByteLength >= EXTRA_LARGE_STRUCTURE_WARMUP_THRESHOLD) {
    return Math.max(baseDelayMs, EXTRA_LARGE_STRUCTURE_WARMUP_DELAY_MS);
  }

  if (textByteLength >= LARGE_STRUCTURE_WARMUP_THRESHOLD) {
    return Math.max(baseDelayMs, LARGE_STRUCTURE_WARMUP_DELAY_MS);
  }

  return baseDelayMs;
}

export function buildJsonWorkerProcessingPlan(
  text: string,
  locateRequested: boolean,
  knownMetrics?: JsonDocumentMetrics
): JsonWorkerProcessingPlan {
  const metrics = knownMetrics ?? measureJsonDocument(text);
  const textByteLength = metrics.textByteLength;
  const largeMode = shouldUseLargeModeForMetrics(metrics);
  const shouldBuildStructureIndex =
    !largeMode && textByteLength > 0 && textByteLength <= STRUCTURE_SYNC_THRESHOLD && locateRequested;
  const shouldAttemptDirectLocate = largeMode && locateRequested;
  const workerLocateEnabled = shouldBuildStructureIndex || shouldAttemptDirectLocate;

  return {
    textByteLength,
    largeMode,
    shouldBuildStructureIndex,
    shouldAttemptDirectLocate,
    workerLocateEnabled,
    shouldDeferStructureIndex: false,
    shouldBuildLargeViewer:
      textByteLength >= DEDICATED_RIGHT_VIEWER_THRESHOLD || metrics.exceedsDedicatedViewerLineThreshold,
    deferredStructureWarmupDelayMs: getDeferredStructureWarmupDelayMs(textByteLength),
  };
}
