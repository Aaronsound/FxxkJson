import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Tab } from '../types/jsonTool';
import { useJsonToolTabActions } from './useJsonToolTabActions';

vi.mock('../utils/jsonToolModels', () => ({ createTab: (id: string) => ({ id, title: 'newTab' }) }));

function useHarness(
  initial: Tab[] = [
    { id: 'a', title: '草稿/中文' },
    { id: 'b', title: 'b' },
  ]
) {
  const [tabs, setTabs] = useState(initial);
  const [activeTabId, setActiveTabId] = useState('a');
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const rawTextByTabRef = useRef<Record<string, string>>({ a: '{"broken":', b: 'true' });
  const formattedTextByTabRef = useRef<Record<string, string>>({});
  const restore = useRef(
    vi.fn(async (id: string, snapshot: { text: string }) => {
      rawTextByTabRef.current[id] = snapshot.text;
    })
  );
  const args: Parameters<typeof useJsonToolTabActions>[0] = {
    activeTabId,
    activeTabIdRef,
    tabs,
    setTabs,
    setActiveTabId,
    rawTextByTabRef,
    formattedTextByTabRef,
    restoreTabContent: restore.current,
    handleClear: () => {
      rawTextByTabRef.current[activeTabId] = '';
    },
    initializeTabArtifacts: vi.fn(),
    initializeTabState: vi.fn(),
    largeFileLocateEnabledRef: useRef({}),
    largeModeRef: useRef({}),
    leftEditorRef: useRef(null),
    rightEditorRef: useRef(null),
    leftSearchWorkerRevisionRef: useRef({}),
    leftViewStateByTabRef: useRef({}),
    rightViewStateByTabRef: useRef({}),
    rawRevisionByTabRef: useRef({}),
    removeTabArtifacts: (id) => {
      delete rawTextByTabRef.current[id];
    },
    removeTabArtifactsState: vi.fn(),
    setPerformanceByTab: vi.fn(),
    structureStatusRef: useRef({}),
    workerStructureEnabledRef: useRef({}),
  };
  return { ...useJsonToolTabActions(args), tabs, activeTabId, rawTextByTabRef, restore: restore.current };
}

describe('tab restore integration', () => {
  it('restores consecutive closes in reverse order, including a background tab', async () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.closeTab('b'));
    expect(result.current.activeTabId).toBe('a');
    act(() => result.current.closeTab('a'));
    await act(async () => result.current.reopenTab());
    expect(result.current.rawTextByTabRef.current[result.current.activeTabId]).toBe('{"broken":');
    expect(result.current.canReopenTab).toBe(true);
    await act(async () => result.current.reopenTab());
    expect(result.current.rawTextByTabRef.current[result.current.activeTabId]).toBe('true');
    expect(result.current.tabs.at(-1)?.title).toBe('b');
    expect(result.current.canReopenTab).toBe(false);
  });
  it('releases the closed tab then restores an exact invalid draft under a fresh ID', async () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.closeTab('a'));
    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['b']);
    expect(result.current.rawTextByTabRef.current.a).toBeUndefined();
    expect(result.current.canReopenTab).toBe(true);
    await act(async () => result.current.reopenTab());
    const restored = result.current.tabs.at(-1)!;
    expect(restored.id).not.toBe('a');
    expect(restored.title).toBe('草稿/中文');
    expect(result.current.activeTabId).toBe(restored.id);
    expect(result.current.rawTextByTabRef.current[restored.id]).toBe('{"broken":');
    expect(result.current.restore).toHaveBeenCalledTimes(1);
    expect(result.current.canReopenTab).toBe(false);
    act(() => result.current.reopenTab());
    expect(result.current.tabs).toHaveLength(2);
  });
  it('can recover the final tab after its existing clear behavior', async () => {
    const { result } = renderHook(() => useHarness([{ id: 'a', title: 'only' }]));
    act(() => result.current.closeTab('a'));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.rawTextByTabRef.current.a).toBe('');
    await act(async () => result.current.reopenTab());
    expect(result.current.rawTextByTabRef.current[result.current.activeTabId]).toBe('{"broken":');
  });
  it('ignores missing tabs and creates unique IDs within the same clock tick', () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.closeTab('missing'));
    expect(result.current.canReopenTab).toBe(false);
    act(() => {
      result.current.addTab();
      result.current.addTab();
    });
    expect(new Set(result.current.tabs.map((tab) => tab.id)).size).toBe(4);
  });
});
