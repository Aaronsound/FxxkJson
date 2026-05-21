import { describe, expect, it } from 'vitest';
import { buildDiagnosticsContext } from './diagnosticsContext';

describe('buildDiagnosticsContext', () => {
  it('returns no context without an active tab', () => {
    expect(
      buildDiagnosticsContext({
        activeDocumentMeta: { rawLength: 0, formattedLength: 0, rawRevision: 0, formattedRevision: 0 },
        activeLeftMatchCount: 0,
        activePerformanceSnapshot: null,
        activeProcessingStage: 'idle',
        activeRightMatchCount: 0,
        activeRightNodeSelection: null,
        activeTab: null,
        currentError: null,
        currentStructureStatus: 'ready',
        importingFileName: null,
        isFormattingActiveTab: false,
        isLargeFileLocateEnabled: false,
        isLargeFileMode: false,
        leftSearchHasMore: false,
        leftSearchTerm: '',
        normalizedLeftMatchIndex: 0,
        normalizedRightMatchIndex: 0,
        rightSearchHasMore: false,
        rightSearchTerm: '',
        shouldUseDedicatedLeftViewer: false,
        shouldUseDedicatedRightViewer: false,
        usesLightweightLocate: false,
      })
    ).toEqual([]);
  });

  it('summarizes search counts and selected paths', () => {
    const context = buildDiagnosticsContext({
      activeDocumentMeta: { rawLength: 12, formattedLength: 20, rawRevision: 1, formattedRevision: 2 },
      activeLeftMatchCount: 3,
      activePerformanceSnapshot: null,
      activeProcessingStage: 'formatting',
      activeRightMatchCount: 8,
      activeRightNodeSelection: {
        path: ['items', 0],
        pathText: '$.items[0]',
        startOffset: 4,
        endOffset: 12,
        updatedAt: 1,
      },
      activeTab: { id: 'tab-1', title: 'sample.json' },
      currentError: null,
      currentStructureStatus: 'ready',
      importingFileName: null,
      isFormattingActiveTab: true,
      isLargeFileLocateEnabled: true,
      isLargeFileMode: true,
      leftSearchHasMore: true,
      leftSearchTerm: 'id',
      normalizedLeftMatchIndex: 1,
      normalizedRightMatchIndex: 0,
      rightSearchHasMore: false,
      rightSearchTerm: 'requestId',
      shouldUseDedicatedLeftViewer: true,
      shouldUseDedicatedRightViewer: true,
      usesLightweightLocate: false,
    });

    expect(context).toContainEqual({ label: 'leftSearch', value: '2/3+' });
    expect(context).toContainEqual({ label: 'rightSearch', value: '1/8' });
    expect(context).toContainEqual({ label: 'rightSelectedPath', value: '$.items[0]' });
  });
});
