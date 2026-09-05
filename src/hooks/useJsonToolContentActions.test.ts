import { describe, expect, it, vi } from 'vitest';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import { useJsonToolContentActions } from './useJsonToolContentActions';
import { JsonValidationError } from '../utils/jsonErrorLocation';

type ContentActionArgs = Parameters<typeof useJsonToolContentActions>[0];

function createArgs(formattedRawRevision = 2, overrides: Partial<ContentActionArgs> = {}) {
  const requestWorkerEditJson = vi.fn(async () => '{\n  "fresh": true\n}');
  const requestWorkerEditJsonResult = vi.fn(async () => ({
    type: 'edit-json-result' as const,
    requestId: 1,
    tabId: 'tab-a',
    success: true,
    data: 'escaped',
  }));
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
    queueFormatFromWorkerCache: vi.fn(),
    queueRepair: vi.fn(),
    renameTab: vi.fn(),
    requestWorkerEditJson,
    requestWorkerEditJsonResult,
    resetSearchState: vi.fn(),
    resetTabArtifacts: vi.fn(),
    setEditJsonBusyLabel: vi.fn(),
    setLargeFileLocateEnabled: vi.fn(),
    setLargeRawViewerData: vi.fn(),
    setLargeViewerData: vi.fn(),
    setLargeViewerStatus: vi.fn(),
    setProcessingStage: vi.fn(),
    setStructureStatus: vi.fn(),
    setTabError: vi.fn(),
    setTabLargeMode: vi.fn(),
    updateTabContent: vi.fn(),
    updateFormattedContent: vi.fn(),
    ...overrides,
  };

  return { args, openDocumentEditSession, requestWorkerEditJson, requestWorkerEditJsonResult };
}

describe('useJsonToolContentActions edit cache', () => {
  const location = { offset: 7, length: 1, line: 1, column: 8, rawRevision: 3 };
  it('opens known invalid raw text directly at its error without another format', async () => {
    const { args } = createArgs(3, { currentErrorLocation: location, getTabContent: () => '{"a":1 "b":2}' });
    await useJsonToolContentActions(args).handleOpenEditJson();
    expect(args.openDocumentEditSession).toHaveBeenCalledWith('{"a":1 "b":2}', location);
    expect(args.requestWorkerEditJson).not.toHaveBeenCalled();
    expect(args.updateTabContent).not.toHaveBeenCalled();
  });

  it('falls back to the exact raw text on syntax failure, but ignores stale locations', async () => {
    const { args } = createArgs(2, { currentErrorLocation: { ...location, rawRevision: 2 } });
    vi.mocked(args.requestWorkerEditJson).mockRejectedValueOnce(new JsonValidationError('invalid', location));
    await useJsonToolContentActions(args).handleOpenEditJson();
    expect(args.requestWorkerEditJson).toHaveBeenCalledOnce();
    expect(args.openDocumentEditSession).toHaveBeenCalledWith('{"raw":true}', location);
    expect(args.setTabError).not.toHaveBeenCalled();
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });

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

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.updateTabContent).toHaveBeenCalledWith('tab-a', 'escaped', true, expect.any(Number));
    });
    expect(args.requestWorkerEditJsonResult).toHaveBeenCalledWith({
      tabId: 'tab-a',
      operation: 'escape-json',
      text: '{"raw":true}',
      textByteLength: 12,
      rawRevision: 3,
      reuseText: true,
    });
    expect(args.requestWorkerEditJson).not.toHaveBeenCalled();
    expect(args.queueFormatFromWorkerCache).toHaveBeenCalledWith('tab-a', 'escaped', expect.any(Object));
    expect(args.resetSearchState).toHaveBeenCalled();
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });

  it('reuses a fresh formatted container across the first escape boundary', async () => {
    const { args } = createArgs(3);

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.updateFormattedContent).toHaveBeenCalledWith(
        'tab-a',
        '{\n  "cached": true\n}',
        false,
        16,
        expect.any(Number)
      );
    });
    expect(args.queueFormat).not.toHaveBeenCalled();
  });

  it('formats deeper escape layers instead of reusing a stale right pane', async () => {
    const source = JSON.stringify('{"raw":true}');
    const { args } = createArgs(3, {
      getTabContent: vi.fn(() => source),
      requestWorkerEditJsonResult: vi.fn(async () => ({
        type: 'edit-json-result' as const,
        requestId: 1,
        tabId: 'tab-a',
        success: true,
        data: JSON.stringify(source),
      })),
    });

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.queueFormatFromWorkerCache).toHaveBeenCalledWith('tab-a', JSON.stringify(source), expect.any(Object));
    });
    expect(args.updateFormattedContent).not.toHaveBeenCalled();
  });

  it('applies a worker-provided virtual right result for a large deeper escape immediately', async () => {
    const source = JSON.stringify('{"raw":true}');
    const transformed = JSON.stringify(source);
    const viewerData = {
      lineCount: 2,
      lineStarts: new Uint32Array([0, 10]),
      literalChunks: true,
      regions: {
        startLines: new Uint32Array(0),
        endLines: new Uint32Array(0),
        parentIndexes: new Int32Array(0),
        kinds: new Uint8Array(0),
      },
    };
    const { args } = createArgs(3, {
      getTabContent: vi.fn(() => source),
      requestWorkerEditJsonResult: vi.fn(async () => ({
        type: 'edit-json-result' as const,
        requestId: 1,
        tabId: 'tab-a',
        success: true,
        data: transformed,
        formattedMatchesRaw: true,
        formattedMetrics: { exceedsDedicatedViewerLineThreshold: false, lineCount: 1, textByteLength: 22 },
        viewerData,
      })),
    });

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.updateFormattedContent).toHaveBeenCalledWith('tab-a', transformed, false, 22, expect.any(Number));
    });
    expect(args.setLargeViewerData).toHaveBeenCalledWith('tab-a', viewerData);
    expect(args.setLargeViewerStatus).toHaveBeenCalledWith('tab-a', 'ready');
    expect(args.queueFormat).not.toHaveBeenCalled();
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

  it('rejects an empty full-document transform before starting worker work', async () => {
    const { args } = createArgs(2, { getTabContent: vi.fn(() => '  ') });

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.setTabError).toHaveBeenCalledWith('tab-a', '没有可转义的内容');
    });
    expect(args.requestWorkerEditJsonResult).not.toHaveBeenCalled();
    expect(args.setEditJsonBusyLabel).not.toHaveBeenCalled();
  });

  it('reports an empty worker transform result without mutating the document', async () => {
    const { args } = createArgs(2, {
      requestWorkerEditJsonResult: vi.fn(async () => ({
        type: 'edit-json-result' as const,
        requestId: 1,
        tabId: 'tab-a',
        success: true,
      })),
    });

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.setTabError).toHaveBeenCalledWith('tab-a', '转义失败：JSON worker returned an empty result');
    });
    expect(args.updateTabContent).not.toHaveBeenCalled();
  });

  it.each([
    ['escape-json', 'handleEscapeJson', expect.objectContaining({ rowCount: 1 })],
    ['unescape-json', 'handleUnescapeJson', null],
  ] as const)('builds the expected large raw fallback for %s', async (_operation, actionName, expectedViewer) => {
    const { args } = createArgs(2, {
      requestWorkerEditJsonResult: vi.fn(async () => ({
        type: 'edit-json-result' as const,
        requestId: 1,
        tabId: 'tab-a',
        success: true,
        data: 'transformed',
        rawMetrics: {
          exceedsDedicatedViewerLineThreshold: false,
          lineCount: 1,
          textByteLength: LARGE_FILE_THRESHOLD,
        },
      })),
    });

    useJsonToolContentActions(args)[actionName]();

    await vi.waitFor(() => {
      expect(args.setLargeRawViewerData).toHaveBeenCalledWith('tab-a', expectedViewer);
    });
  });

  it('applies a worker-formatted raw result without a dedicated viewer or explicit formatted metrics', async () => {
    const { args } = createArgs(2, {
      requestWorkerEditJsonResult: vi.fn(async () => ({
        type: 'edit-json-result' as const,
        requestId: 1,
        tabId: 'tab-a',
        success: true,
        data: 'transformed',
        formattedMatchesRaw: true,
      })),
    });

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.updateFormattedContent).toHaveBeenCalledWith(
        'tab-a',
        'transformed',
        true,
        expect.any(Number),
        expect.any(Number)
      );
    });
    expect(args.setLargeViewerData).toHaveBeenCalledWith('tab-a', null);
    expect(args.setLargeViewerStatus).toHaveBeenCalledWith('tab-a', 'idle');
  });

  it('reports transform errors and does not mutate document content', async () => {
    const { args } = createArgs();
    vi.mocked(args.requestWorkerEditJsonResult).mockRejectedValueOnce(new Error('transform failed'));

    useJsonToolContentActions(args).handleEscapeJson();

    await vi.waitFor(() => {
      expect(args.setTabError).toHaveBeenCalledWith('tab-a', '转义失败：transform failed');
    });
    expect(args.updateTabContent).not.toHaveBeenCalled();
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });

  it('reports non-Error transform and edit failures with their generic labels', async () => {
    const transform = createArgs();
    vi.mocked(transform.args.requestWorkerEditJsonResult).mockRejectedValueOnce('failed');
    vi.mocked(transform.args.requestWorkerEditJson).mockRejectedValueOnce('failed');

    useJsonToolContentActions(transform.args).handleUnescapeJson();
    await useJsonToolContentActions(transform.args).handleOpenEditJson();

    await vi.waitFor(() => {
      expect(transform.args.setTabError).toHaveBeenCalledWith('tab-a', '反转义失败');
      expect(transform.args.setTabError).toHaveBeenCalledWith('tab-a', '打开 JSON 编辑失败');
    });
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

  it('disables structure for a byte-large document and measures content when metadata is empty', () => {
    const large = createArgs(2, {
      activeDocumentMeta: {
        rawLength: LARGE_FILE_THRESHOLD,
        formattedLength: 0,
        rawRevision: 1,
        formattedRevision: 0,
        formattedRawRevision: 0,
      },
      getTabContent: vi.fn(() => '{"large":true}'),
    });
    useJsonToolContentActions(large.args).handleLargeFileLocateToggle(false);
    expect(large.args.clearTabStructure).toHaveBeenCalledWith('tab-a', 'disabled');

    const unknownMetrics = createArgs(2, {
      activeDocumentMeta: {
        rawLength: 0,
        formattedLength: 0,
        rawRevision: 1,
        formattedRevision: 0,
        formattedRawRevision: 0,
      },
    });
    useJsonToolContentActions(unknownMetrics.args).handleFormat();
    expect(unknownMetrics.args.queueFormat).toHaveBeenCalledWith(
      'tab-a',
      '{"raw":true}',
      true,
      expect.objectContaining({ textByteLength: 12 })
    );
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
