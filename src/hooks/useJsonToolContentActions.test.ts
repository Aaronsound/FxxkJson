import { describe, expect, it, vi } from 'vitest';
import { useJsonToolContentActions } from './useJsonToolContentActions';

function createArgs(formattedRawRevision: number) {
  const requestWorkerEditJson = vi.fn(async () => '{\n  "fresh": true\n}');
  const openDocumentEditSession = vi.fn();
  const args: Parameters<typeof useJsonToolContentActions>[0] = {
    activeTab: { id: 'tab-a', title: 'sample.json' },
    activeDocumentMeta: {
      rawLength: 12,
      formattedLength: 16,
      rawRevision: 3,
      formattedRevision: 2,
      formattedRawRevision,
    },
    beginPerformanceSession: vi.fn(),
    clearPerformanceState: vi.fn(),
    clearTabStructure: vi.fn(),
    getTabContent: vi.fn(() => '{"raw":true}'),
    getFormattedContent: vi.fn(() => '{\n  "cached": true\n}'),
    leftEditorRef: { current: null },
    leftSearchWorkerRevisionRef: { current: {} },
    largeModeRef: { current: {} },
    openDocumentEditSession,
    queueFormat: vi.fn(),
    queueRepair: vi.fn(),
    renameTab: vi.fn(),
    requestWorkerEditJson,
    resetSearchState: vi.fn(),
    resetTabArtifacts: vi.fn(),
    setEditJsonBusyLabel: vi.fn(),
    setLargeFileLocateEnabled: vi.fn(),
    setStructureStatus: vi.fn(),
    setTabError: vi.fn(),
    setTabLargeMode: vi.fn(),
    updateTabContent: vi.fn(),
  };

  return { args, openDocumentEditSession, requestWorkerEditJson };
}

describe('useJsonToolContentActions edit cache', () => {
  it('opens the formatted cache when it matches the current raw revision', async () => {
    const { args, openDocumentEditSession, requestWorkerEditJson } = createArgs(3);

    await useJsonToolContentActions(args).handleOpenEditJson();

    expect(requestWorkerEditJson).not.toHaveBeenCalled();
    expect(openDocumentEditSession).toHaveBeenCalledWith('{\n  "cached": true\n}');
  });

  it('formats again when the cached content belongs to an older raw revision', async () => {
    const { args, openDocumentEditSession, requestWorkerEditJson } = createArgs(2);

    await useJsonToolContentActions(args).handleOpenEditJson();

    expect(requestWorkerEditJson).toHaveBeenCalledWith({
      tabId: 'tab-a',
      operation: 'format',
      text: '{"raw":true}',
    });
    expect(openDocumentEditSession).toHaveBeenCalledWith('{\n  "fresh": true\n}');
  });
});
