import { DEDICATED_RIGHT_VIEWER_THRESHOLD, LARGE_FILE_THRESHOLD, STRUCTURE_SYNC_THRESHOLD } from '../types/jsonTool';
import { exceedsLineCountThreshold, getUtf8ByteLength } from './jsonDocumentMetrics';

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
  knownTextByteLength?: number
): JsonWorkerProcessingPlan {
  const textByteLength = knownTextByteLength ?? getUtf8ByteLength(text);
  const largeMode = textByteLength >= LARGE_FILE_THRESHOLD || exceedsLineCountThreshold(text);
  const shouldBuildStructureIndex = textByteLength > 0 && textByteLength <= STRUCTURE_SYNC_THRESHOLD && locateRequested;
  const shouldAttemptDirectLocate = !shouldBuildStructureIndex && locateRequested && largeMode;
  const workerLocateEnabled = shouldBuildStructureIndex || shouldAttemptDirectLocate;

  return {
    textByteLength,
    largeMode,
    shouldBuildStructureIndex,
    shouldAttemptDirectLocate,
    workerLocateEnabled,
    shouldDeferStructureIndex: largeMode && shouldBuildStructureIndex,
    shouldBuildLargeViewer: textByteLength >= DEDICATED_RIGHT_VIEWER_THRESHOLD,
    deferredStructureWarmupDelayMs: getDeferredStructureWarmupDelayMs(textByteLength),
  };
}
