import { DEDICATED_RIGHT_VIEWER_THRESHOLD } from '../types/jsonTool';
import {
  getUtf8ByteLength,
  shouldBuildWorkerStructure,
  shouldUseLargeMode,
} from './jsonDocumentMetrics';

export interface JsonWorkerProcessingPlan {
  textByteLength: number;
  largeMode: boolean;
  shouldBuildStructureIndex: boolean;
  shouldAttemptDirectLocate: boolean;
  workerLocateEnabled: boolean;
  shouldDeferStructureIndex: boolean;
  shouldBuildLargeViewer: boolean;
}

export function buildJsonWorkerProcessingPlan(
  text: string,
  locateRequested: boolean
): JsonWorkerProcessingPlan {
  const textByteLength = getUtf8ByteLength(text);
  const largeMode = shouldUseLargeMode(text);
  const shouldBuildStructureIndex = shouldBuildWorkerStructure(
    text,
    locateRequested
  );
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
  };
}
