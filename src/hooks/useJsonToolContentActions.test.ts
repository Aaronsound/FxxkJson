import { describe, expect, it, vi } from 'vitest';
import { useJsonToolContentActions } from './useJsonToolContentActions';

type ContentActionArgs = Parameters<typeof useJsonToolContentActions>[0];

function createArgs(formattedRawRevision = 2, overrides: Partial<ContentActionArgs> = {}) {
  const requestWorkerEditJson = vi.fn(async () => '{\n  "fresh": true\n}');
  const openDocumentEditSession = vi.fn();
  const args: ContentActionArgs = {
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
    ...overrides,
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

  it('reports a worker failure and always clears the busy state', async () => {
    const { args } = createArgs(2);
    vi.mocked(args.requestWorkerEditJson).mockRejectedValueOnce(new Error('broken input'));

    await useJsonToolContentActions(args).handleOpenEditJson();

    expect(args.setTabError).toHaveBeenCalledWith('tab-a', '打开 JSON 编辑失败：broken input');
    expect(args.setEditJsonBusyLabel).toHaveBeenNthCalledWith(1, '正在准备编辑内容...');
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });
});

describe('useJsonToolContentActions primary commands', () => {
  it('formats a non-empty document and keeps an already-enabled large mode', () => {
    const { args } = createArgs();
    args.largeModeRef.current['tab-a'] = true;

    useJsonToolContentActions(args).handleFormat();

    expect(args.beginPerformanceSession).toHaveBeenCalledWith(
      'tab-a',
      'manual-format',
      'sample.json',
      null,
      expect.any(Number),
      true
    );
    expect(args.setTabLargeMode).toHaveBeenCalledWith('tab-a', true);
    expect(args.queueFormat).toHaveBeenCalledWith('tab-a', '{"raw":true}', true, expect.any(Object));
  });

  it('clears performance state before formatting an empty document', () => {
    const { args } = createArgs(2, { getTabContent: vi.fn(() => '   ') });

    useJsonToolContentActions(args).handleFormat();

    expect(args.clearPerformanceState).toHaveBeenCalledWith('tab-a');
    expect(args.beginPerformanceSession).not.toHaveBeenCalled();
    expect(args.queueFormat).toHaveBeenCalledWith('tab-a', '   ', true, expect.any(Object));
  });

  it('rejects an empty repair and queues a valid repair with metrics', () => {
    const empty = createArgs(2, { getTabContent: vi.fn(() => '') });
    useJsonToolContentActions(empty.args).handleRepairJson();
    expect(empty.args.setTabError).toHaveBeenCalledWith('tab-a', '没有可修复的 JSON 内容');

    const valid = createArgs();
    useJsonToolContentActions(valid.args).handleRepairJson();
    expect(valid.args.beginPerformanceSession).toHaveBeenCalledWith(
      'tab-a',
      'repair',
      'sample.json',
      null,
      expect.any(Number),
      false
    );
    expect(valid.args.queueRepair).toHaveBeenCalledWith('tab-a', '{"raw":true}', expect.any(Object));
  });

  it('transforms a full document and queues the formatted result', async () => {
    const { args } = createArgs();
    vi.mocked(args.requestWorkerEditJson).mockResolvedValueOnce('escaped');

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.updateTabContent).toHaveBeenCalledWith('tab-a', 'escaped', true, expect.any(Number));
    });
    expect(args.requestWorkerEditJson).toHaveBeenCalledWith({
      tabId: 'tab-a',
      operation: 'escape-json',
      text: '{"raw":true}',
    });
    expect(args.queueFormat).toHaveBeenCalledWith('tab-a', 'escaped', true, expect.any(Object));
    expect(args.resetSearchState).toHaveBeenCalled();
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });

  it('transforms only the selected editor text when a selection exists', async () => {
    const { args } = createArgs();
    const selection = { isEmpty: () => false };
    const executeEdits = vi.fn();
    args.leftEditorRef.current = {
      executeEdits,
      getModel: () => ({ getValueInRange: () => 'selected' }),
      getSelection: () => selection,
    } as unknown as NonNullable<ContentActionArgs['leftEditorRef']['current']>;
    vi.mocked(args.requestWorkerEditJson).mockResolvedValueOnce('unescaped');

    useJsonToolContentActions(args).handleUnescapeJson();

    await vi.waitFor(() => {
      expect(executeEdits).toHaveBeenCalledWith('json-escape-transform', [
        { range: selection, text: 'unescaped', forceMoveMarkers: true },
      ]);
    });
    expect(args.requestWorkerEditJson).toHaveBeenCalledWith({
      tabId: 'tab-a',
      operation: 'unescape-json',
      text: 'selected',
    });
    expect(args.updateTabContent).not.toHaveBeenCalled();
    expect(args.queueFormat).not.toHaveBeenCalled();
  });

  it('reports transform errors and does not mutate document content', async () => {
    const { args } = createArgs();
    vi.mocked(args.requestWorkerEditJson).mockRejectedValueOnce(new Error('transform failed'));

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.setTabError).toHaveBeenCalledWith('tab-a', '转义失败：transform failed');
    });
    expect(args.updateTabContent).not.toHaveBeenCalled();
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });

  it('toggles large-file locate without rebuilding disabled or empty documents', () => {
    const disabled = createArgs();
    useJsonToolContentActions(disabled.args).handleLargeFileLocateToggle(false);
    expect(disabled.args.setLargeFileLocateEnabled).toHaveBeenCalledWith('tab-a', false);
    expect(disabled.args.clearTabStructure).toHaveBeenCalledWith('tab-a', 'ready');
    expect(disabled.args.queueFormat).not.toHaveBeenCalled();

    const empty = createArgs(2, { getTabContent: vi.fn(() => '') });
    useJsonToolContentActions(empty.args).handleLargeFileLocateToggle(true);
    expect(empty.args.setStructureStatus).toHaveBeenCalledWith('tab-a', 'ready');
    expect(empty.args.queueFormat).not.toHaveBeenCalled();
  });

  it('rebuilds a populated document when large-file locate is enabled', () => {
    const { args } = createArgs();

    useJsonToolContentActions(args).handleLargeFileLocateToggle(true);

    expect(args.setLargeFileLocateEnabled).toHaveBeenCalledWith('tab-a', true);
    expect(args.queueFormat).toHaveBeenCalledWith('tab-a', '{"raw":true}', true, expect.any(Object));
  });

  it('clears the active tab and releases its search revision', () => {
    const { args } = createArgs();
    args.leftSearchWorkerRevisionRef.current['tab-a'] = 7;

    useJsonToolContentActions(args).handleClear();

    expect(args.renameTab).toHaveBeenCalledWith('tab-a', 'newTab');
    expect(args.leftSearchWorkerRevisionRef.current['tab-a']).toBeUndefined();
    expect(args.resetTabArtifacts).toHaveBeenCalledWith('tab-a');
    expect(args.resetSearchState).toHaveBeenCalled();
  });

  it('does nothing when no tab is active', async () => {
    const { args } = createArgs(2, { activeTab: null });
    const actions = useJsonToolContentActions(args);

    actions.handleFormat();
    actions.handleRepairJson();
    actions.handleEscapeJson();
    actions.handleLargeFileLocateToggle(true);
    actions.handleClear();
    await actions.handleOpenEditJson();

    expect(args.queueFormat).not.toHaveBeenCalled();
    expect(args.queueRepair).not.toHaveBeenCalled();
    expect(args.requestWorkerEditJson).not.toHaveBeenCalled();
    expect(args.resetTabArtifacts).not.toHaveBeenCalled();
  });
});
