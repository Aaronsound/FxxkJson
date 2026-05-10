import { describe, expect, it } from 'vitest';
import {
  LARGE_FILE_THRESHOLD,
  STRUCTURE_SYNC_THRESHOLD,
} from '../types/jsonTool';
import { buildJsonWorkerProcessingPlan } from './jsonWorkerPlan';

describe('jsonWorkerPlan', () => {
  it('keeps small documents out of large viewer while retaining normal structure locate', () => {
    const plan = buildJsonWorkerProcessingPlan('{"ok":true}', false);

    expect(plan.largeMode).toBe(false);
    expect(plan.shouldBuildLargeViewer).toBe(false);
    expect(plan.shouldBuildStructureIndex).toBe(true);
    expect(plan.shouldAttemptDirectLocate).toBe(false);
    expect(plan.workerLocateEnabled).toBe(true);
  });

  it('builds a deferred structure index for supported large files when locate is requested', () => {
    const text = 'a'.repeat(LARGE_FILE_THRESHOLD);
    const plan = buildJsonWorkerProcessingPlan(text, true);

    expect(plan.largeMode).toBe(true);
    expect(plan.shouldBuildLargeViewer).toBe(true);
    expect(plan.shouldBuildStructureIndex).toBe(true);
    expect(plan.shouldAttemptDirectLocate).toBe(false);
    expect(plan.workerLocateEnabled).toBe(true);
    expect(plan.shouldDeferStructureIndex).toBe(true);
  });

  it('uses direct lightweight locate above the full structure sync threshold', () => {
    const text = 'a'.repeat(STRUCTURE_SYNC_THRESHOLD + 1);
    const plan = buildJsonWorkerProcessingPlan(text, true);

    expect(plan.largeMode).toBe(true);
    expect(plan.shouldBuildLargeViewer).toBe(true);
    expect(plan.shouldBuildStructureIndex).toBe(false);
    expect(plan.shouldAttemptDirectLocate).toBe(true);
    expect(plan.workerLocateEnabled).toBe(true);
    expect(plan.shouldDeferStructureIndex).toBe(false);
  });
});
