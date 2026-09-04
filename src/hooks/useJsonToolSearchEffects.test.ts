import { act, renderHook } from '@testing-library/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS, EMPTY_DOCUMENT_META } from '../types/jsonTool';
import { getMonacoSearchBatch } from '../utils/jsonEditorInteractions';
import { useJsonToolSearchEffects } from './useJsonToolSearchEffects';

vi.mock('../utils/jsonEditorInteractions', () => ({
  getMonacoSearchBatch: vi.fn(),
}));

type SearchEffectsArgs = Parameters<typeof useJsonToolSearchEffects>[0];

function createArgs(overrides: Partial<SearchEffectsArgs> = {}): SearchEffectsArgs {
  return {
    activeDocumentMeta: EMPTY_DOCUMENT_META,
    activeLargeViewerData: null,
    activeTab: { id: 'tab-a', title: 'sample.json' },
    activeTabId: 'tab-a',
    clearLeftHighlights: vi.fn(),
    clearRightHighlights: vi.fn(),
    getTabContent: vi.fn(() => '{"needle":true}'),
    isBuildingDedicatedRightViewer: false,
    largeRawViewerRef: { current: null },
    largeViewerRef: { current: null },
    leftEditorRef: { current: null },
    leftSearchOptions: DEFAULT_SEARCH_OPTIONS,
    leftSearchTerm: '',
    leftSearchWorkerRevisionRef: { current: {} },
    rememberRightSearchTerm: vi.fn(),
    requestWorkerSearch: vi.fn(),
    resetLeftSearchState: vi.fn(),
    resetRightSearchState: vi.fn(),
    resetSearchState: vi.fn(),
    rightDecorationIdsRef: { current: [] },
    rightEditorRef: { current: null },
    rightMatchIndex: 0,
    rightSearchOptions: DEFAULT_SEARCH_OPTIONS,
    rightSearchTerm: '',
    setIsLeftFindOpen: vi.fn(),
    setIsLeftSearchLoadingMore: vi.fn(),
    setIsRightFindOpen: vi.fn(),
    setIsRightSearchLoadingMore: vi.fn(),
    setLargeRawViewerMatches: vi.fn(),
    setLargeViewerMatchCount: vi.fn(),
    setLargeViewerMatches: vi.fn(),
    setLeftMatches: vi.fn(),
    setLeftSearchHasMore: vi.fn(),
    setLeftSearchNextOffset: vi.fn(),
    setRightMatches: vi.fn(),
    setRightSearchHasMore: vi.fn(),
    setRightSearchNextOffset: vi.fn(),
    shouldUseDedicatedLeftViewer: false,
    shouldUseDedicatedRightViewer: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useJsonToolSearchEffects', () => {
  it('sends dedicated viewer searches and transfers left text once per raw revision', () => {
    const requestWorkerSearch = vi.fn();
    const leftSearchWorkerRevisionRef = { current: {} as Record<string, number> };
    const args = createArgs({
      activeDocumentMeta: { ...EMPTY_DOCUMENT_META, rawLength: 16, rawRevision: 3, formattedRevision: 2 },
      activeLargeViewerData: {},
      leftSearchTerm: 'needle',
      leftSearchWorkerRevisionRef,
      requestWorkerSearch,
      rightSearchTerm: 'value',
      shouldUseDedicatedLeftViewer: true,
      shouldUseDedicatedRightViewer: true,
    });

    const { rerender } = renderHook((props: SearchEffectsArgs) => useJsonToolSearchEffects(props), {
      initialProps: args,
    });

    expect(requestWorkerSearch).toHaveBeenCalledWith({
      tabId: 'tab-a',
      query: 'value',
      searchOptions: DEFAULT_SEARCH_OPTIONS,
    });
    expect(requestWorkerSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 'tab-a',
        target: 'left',
        query: 'needle',
        text: '{"needle":true}',
        textByteLength: 16,
        rawRevision: 3,
      })
    );
    expect(leftSearchWorkerRevisionRef.current['tab-a']).toBe(3);

    requestWorkerSearch.mockClear();
    rerender({ ...args, leftSearchOptions: { ...DEFAULT_SEARCH_OPTIONS, matchCase: true } });
    expect(requestWorkerSearch).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'left', text: undefined, textByteLength: undefined, rawRevision: 3 })
    );
  });

  it('decorates and reveals the active Monaco result', () => {
    const match = new monaco.Range(2, 3, 2, 9);
    vi.mocked(getMonacoSearchBatch).mockReturnValue({
      ranges: [match],
      matches: [],
      hasMore: true,
      nextStartOffset: 27,
    });
    const editor = {
      getModel: vi.fn(() => ({})),
      deltaDecorations: vi.fn(() => ['search-1']),
      revealRangeInCenter: vi.fn(),
      setSelection: vi.fn(),
    };
    const rightDecorationIdsRef = { current: [] as string[] };
    const setRightMatches = vi.fn();
    const setRightSearchHasMore = vi.fn();
    const setRightSearchNextOffset = vi.fn();

    renderHook(() =>
      useJsonToolSearchEffects(
        createArgs({
          rightDecorationIdsRef,
          rightEditorRef: { current: editor as never },
          rightMatchIndex: 0,
          rightSearchTerm: 'needle',
          setRightMatches,
          setRightSearchHasMore,
          setRightSearchNextOffset,
        })
      )
    );

    expect(setRightMatches).toHaveBeenCalledWith([match]);
    expect(setRightSearchHasMore).toHaveBeenCalledWith(true);
    expect(setRightSearchNextOffset).toHaveBeenCalledWith(27);
    expect(editor.deltaDecorations).toHaveBeenCalledWith([], [expect.objectContaining({ range: match })]);
    expect(editor.revealRangeInCenter).toHaveBeenCalledWith(match);
    expect(editor.setSelection).toHaveBeenCalledOnce();
    expect(rightDecorationIdsRef.current).toEqual(['search-1']);
  });

  it('remembers a non-empty right search only after the debounce', () => {
    vi.useFakeTimers();
    const rememberRightSearchTerm = vi.fn();
    renderHook(() => useJsonToolSearchEffects(createArgs({ rememberRightSearchTerm, rightSearchTerm: 'needle' })));

    expect(rememberRightSearchTerm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(799));
    expect(rememberRightSearchTerm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(rememberRightSearchTerm).toHaveBeenCalledWith('needle');
  });

  it('opens and closes both find widgets while restoring the owning pane focus', () => {
    const largeLeftFocus = vi.fn();
    const largeRightFocus = vi.fn();
    const resetLeftSearchState = vi.fn();
    const resetRightSearchState = vi.fn();
    const setIsLeftFindOpen = vi.fn();
    const setIsRightFindOpen = vi.fn();
    const args = createArgs({
      largeRawViewerRef: { current: { focus: largeLeftFocus } as never },
      largeViewerRef: { current: { focus: largeRightFocus } as never },
      resetLeftSearchState,
      resetRightSearchState,
      setIsLeftFindOpen,
      setIsRightFindOpen,
      shouldUseDedicatedLeftViewer: true,
      shouldUseDedicatedRightViewer: true,
    });
    const { result } = renderHook(() => useJsonToolSearchEffects(args));

    act(() => {
      result.current.openLeftFind();
      result.current.openRightFind();
      result.current.closeLeftFind();
      result.current.closeRightFind();
    });

    expect(setIsLeftFindOpen).toHaveBeenCalledWith(true);
    expect(setIsRightFindOpen).toHaveBeenCalledWith(true);
    expect(resetLeftSearchState).toHaveBeenCalledOnce();
    expect(resetRightSearchState).toHaveBeenCalledOnce();
    expect(largeLeftFocus).toHaveBeenCalledOnce();
    expect(largeRightFocus).toHaveBeenCalledOnce();
  });
});
