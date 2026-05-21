import { renderHook } from '@testing-library/react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS, EMPTY_DOCUMENT_META } from '../types/jsonTool';
import { getMonacoSearchBatch, getReplacementText } from '../utils/jsonEditorInteractions';
import { useJsonPaneSearchActions } from './useJsonPaneSearchActions';

vi.mock('../utils/jsonEditorInteractions', () => ({
  getMonacoSearchBatch: vi.fn(),
  getReplacementText: vi.fn(),
}));

function range(startColumn: number, endColumn: number) {
  return {
    startLineNumber: 1,
    startColumn,
    endLineNumber: 1,
    endColumn,
  } as monaco.Range;
}

function createEditor(model: Partial<monaco.editor.ITextModel> = {}) {
  return {
    deltaDecorations: vi.fn(() => ['next-decoration']),
    executeEdits: vi.fn(),
    focus: vi.fn(),
    getModel: vi.fn(() => model),
  } as unknown as monaco.editor.IStandaloneCodeEditor;
}

function createArgs(overrides: Partial<Parameters<typeof useJsonPaneSearchActions>[0]> = {}) {
  const leftModel = {
    getOffsetAt: vi.fn((position: monaco.IPosition) => position.column),
  } as unknown as monaco.editor.ITextModel;
  const rightModel = {} as monaco.editor.ITextModel;
  const leftEditor = createEditor(leftModel);
  const rightEditor = createEditor(rightModel);

  return {
    activeDocumentMeta: { ...EMPTY_DOCUMENT_META, rawRevision: 3 },
    activeLeftMatchCount: 2,
    activeRightMatchCount: 1,
    activeTab: { id: 'tab-1', title: 'demo' },
    isBuildingDedicatedRightViewer: false,
    isLeftSearchLoadingMore: false,
    isRightSearchLoadingMore: false,
    leftEditorRef: { current: leftEditor },
    leftMatches: [range(1, 4), range(5, 8)],
    leftReplaceText: 'after',
    leftSearchHasMore: true,
    leftSearchNextOffset: 19,
    leftSearchOptions: DEFAULT_SEARCH_OPTIONS,
    leftSearchTerm: 'before',
    normalizedLeftMatchIndex: 0,
    requestWorkerSearch: vi.fn(),
    resetLeftSearchPaging: vi.fn(),
    resetRightSearchPaging: vi.fn(),
    rightDecorationIdsRef: { current: ['old-decoration'] },
    rightEditorRef: { current: rightEditor },
    rightMatchIndex: 0,
    rightMatches: [range(2, 6)],
    rightSearchHasMore: true,
    rightSearchNextOffset: 12,
    rightSearchOptions: DEFAULT_SEARCH_OPTIONS,
    rightSearchTerm: 'needle',
    setIsLeftSearchLoadingMore: vi.fn(),
    setIsRightSearchLoadingMore: vi.fn(),
    setLargeViewerMatchCount: vi.fn(),
    setLargeViewerMatches: vi.fn(),
    setLeftMatchIndex: vi.fn(),
    setLeftSearchOptions: vi.fn(),
    setLeftSearchTerm: vi.fn(),
    setRightMatchIndex: vi.fn(),
    setRightMatches: vi.fn(),
    setRightSearchHasMore: vi.fn(),
    setRightSearchNextOffset: vi.fn(),
    setRightSearchOptions: vi.fn(),
    setRightSearchTerm: vi.fn(),
    shouldUseDedicatedRightViewer: false,
    ...overrides,
  };
}

describe('useJsonPaneSearchActions', () => {
  it('replaces one left match and all left matches from the editor model', () => {
    vi.mocked(getReplacementText).mockReturnValue('replacement');
    const args = createArgs();
    const { result } = renderHook(() => useJsonPaneSearchActions(args));

    result.current.replaceLeftMatch();
    result.current.replaceAllLeftMatches();

    expect(args.leftEditorRef.current?.executeEdits).toHaveBeenNthCalledWith(1, 'pane-find-replace', [
      expect.objectContaining({ range: args.leftMatches[0], text: 'replacement' }),
    ]);
    expect(args.leftEditorRef.current?.executeEdits).toHaveBeenNthCalledWith(
      2,
      'pane-find-replace-all',
      expect.arrayContaining([
        expect.objectContaining({ range: args.leftMatches[0] }),
        expect.objectContaining({ range: args.leftMatches[1] }),
      ])
    );
    expect(args.setLeftMatchIndex).toHaveBeenCalledWith(0);
  });

  it('loads right search batches from the worker for the dedicated viewer', () => {
    const args = createArgs({ shouldUseDedicatedRightViewer: true });
    const { result } = renderHook(() => useJsonPaneSearchActions(args));

    result.current.loadMoreRightSearch();
    result.current.loadMoreLeftSearch();

    expect(args.setIsRightSearchLoadingMore).toHaveBeenCalledWith(true);
    expect(args.requestWorkerSearch).toHaveBeenNthCalledWith(1, 'tab-1', 'needle', DEFAULT_SEARCH_OPTIONS, 12, true);
    expect(args.requestWorkerSearch).toHaveBeenNthCalledWith(
      2,
      'tab-1',
      'before',
      DEFAULT_SEARCH_OPTIONS,
      19,
      true,
      'left',
      undefined,
      3
    );
  });

  it('extends Monaco right search decorations when the editor owns the results', () => {
    const extraRange = range(8, 12);
    vi.mocked(getMonacoSearchBatch).mockReturnValue({
      hasMore: false,
      matches: [],
      nextStartOffset: 42,
      ranges: [extraRange],
    });
    const args = createArgs();
    const { result } = renderHook(() => useJsonPaneSearchActions(args));

    result.current.loadMoreRightSearch();

    expect(args.setRightMatches).toHaveBeenCalledWith([args.rightMatches[0], extraRange]);
    expect(args.setRightSearchHasMore).toHaveBeenCalledWith(false);
    expect(args.setRightSearchNextOffset).toHaveBeenCalledWith(42);
    expect(args.rightDecorationIdsRef.current).toEqual(['next-decoration']);
  });
});
