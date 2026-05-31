// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LARGE_FILE_THRESHOLD, STRUCTURE_SYNC_THRESHOLD } from '../types/jsonTool';
import { buildJsonWorkerProcessingPlan, getDeferredStructureWarmupDelayMs } from './jsonWorkerPlan';

describe('jsonWorkerPlan', () => {
  it('keeps small documents out of large viewer and skips locate index until requested', () => {
    const plan = buildJsonWorkerProcessingPlan('{"ok":true}', false);

    expect(plan.largeMode).toBe(false);
    expect(plan.shouldBuildLargeViewer).toBe(false);
    expect(plan.shouldBuildStructureIndex).toBe(false);
    expect(plan.shouldAttemptDirectLocate).toBe(false);
    expect(plan.workerLocateEnabled).toBe(false);
  });

  it('builds a structure index for small documents when locate is requested', () => {
    const plan = buildJsonWorkerProcessingPlan('{"ok":true}', true);

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
    expect(plan.deferredStructureWarmupDelayMs).toBe(350);
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

  it('backs off deferred structure warmup for larger supported files', () => {
    expect(getDeferredStructureWarmupDelayMs(5 * 1024 * 1024)).toBe(350);
    expect(getDeferredStructureWarmupDelayMs(10 * 1024 * 1024)).toBe(900);
    expect(getDeferredStructureWarmupDelayMs(16 * 1024 * 1024)).toBe(1600);
    expect(getDeferredStructureWarmupDelayMs(16 * 1024 * 1024, 2000)).toBe(2000);
  });
});
