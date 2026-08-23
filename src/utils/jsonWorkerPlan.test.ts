// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LARGE_FILE_THRESHOLD, STRUCTURE_SYNC_THRESHOLD } from '../types/jsonTool';
import { buildJsonWorkerProcessingPlan, getDeferredStructureWarmupDelayMs } from './jsonWorkerPlan';
import { measureJsonDocument } from './jsonDocumentMetrics';

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

  it('uses streaming direct locate for supported large files without building syntax trees', () => {
    const text = 'a'.repeat(LARGE_FILE_THRESHOLD);
    const plan = buildJsonWorkerProcessingPlan(text, true);

    expect(plan.largeMode).toBe(true);
    expect(plan.shouldBuildLargeViewer).toBe(true);
    expect(plan.shouldBuildStructureIndex).toBe(false);
    expect(plan.shouldAttemptDirectLocate).toBe(true);
    expect(plan.workerLocateEnabled).toBe(true);
    expect(plan.shouldDeferStructureIndex).toBe(false);
    expect(plan.deferredStructureWarmupDelayMs).toBe(350);
  });

  it('reuses a byte length measured by the import pipeline', () => {
    const plan = buildJsonWorkerProcessingPlan('small string placeholder', true, {
      ...measureJsonDocument('small string placeholder'),
      textByteLength: LARGE_FILE_THRESHOLD,
    });

    expect(plan.textByteLength).toBe(LARGE_FILE_THRESHOLD);
    expect(plan.largeMode).toBe(true);
    expect(plan.shouldBuildLargeViewer).toBe(true);
  });

  it('builds the direct viewer before enabling locate for line-rich documents', () => {
    const plan = buildJsonWorkerProcessingPlan('small placeholder', true, {
      exceedsDedicatedViewerLineThreshold: true,
      lineCount: 50_001,
      textByteLength: 200_000,
    });

    expect(plan.largeMode).toBe(true);
    expect(plan.shouldBuildLargeViewer).toBe(true);
    expect(plan.shouldAttemptDirectLocate).toBe(true);
    expect(plan.shouldBuildStructureIndex).toBe(false);
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
