import { describe, expect, it, vi } from 'vitest';
import type { WorkerMessage } from '../types/jsonTool';
import { measureJsonDocument } from '../utils/jsonDocumentMetrics';
import { createJsonTextPatch } from '../utils/jsonTextPatch';
import { applyJsonNodeMutationArtifacts } from './applyJsonNodeMutationArtifacts';

describe('applyJsonNodeMutationArtifacts', () => {
  it('applies formatted text and viewer line-index patches together', () => {
    const formattedText = '{\n  "name": "old",\n  "count": 1\n}';
    const nextFormattedText = '{\n  "name": "updated",\n  "count": 1\n}';
    const formattedPatch = createJsonTextPatch(formattedText, nextFormattedText);
    const result: WorkerMessage = {
      type: 'edit-json-result',
      requestId: 1,
      tabId: 'tab-a',
      success: true,
      formattedPatch,
      formattedMetrics: measureJsonDocument(nextFormattedText),
      viewerPatchApplied: true,
    };
    const setLargeViewerData = vi.fn();
    const updateFormattedContent = vi.fn();

    const applied = applyJsonNodeMutationArtifacts({
      formattedText,
      largeMode: true,
      largeViewerData: {
        lineCount: 4,
        lineStarts: Uint32Array.from([0, 2, 19, 32]),
        regions: {
          startLines: Uint32Array.from([1]),
          endLines: Uint32Array.from([4]),
          parentIndexes: Int32Array.from([-1]),
          kinds: Uint8Array.from([0]),
        },
      },
      mutatePerformanceSession: vi.fn(),
      rawByteLength: 25,
      result,
      setLargeRawViewerData: vi.fn(),
      setLargeViewerData,
      setLargeViewerStatus: vi.fn(),
      setProcessingStage: vi.fn(),
      setStructureStatus: vi.fn(),
      setTabFormatting: vi.fn(),
      tabId: 'tab-a',
      updateFormattedContent,
      workerStructureEnabledRef: { current: { 'tab-a': true } },
    });

    expect(applied).toBe(true);
    expect(updateFormattedContent).toHaveBeenCalledWith('tab-a', nextFormattedText, true, 37, 25);
    expect(Array.from(setLargeViewerData.mock.calls[0][1].lineStarts)).toEqual([0, 2, 23, 36]);
  });
});
