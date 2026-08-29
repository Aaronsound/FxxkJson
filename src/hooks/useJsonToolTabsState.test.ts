import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB_TITLE } from '../types/jsonTool';
import { useJsonToolTabsState } from './useJsonToolTabsState';

describe('useJsonToolTabsState', () => {
  it('initializes every tab-scoped state consistently', () => {
    const { result } = renderHook(() => useJsonToolTabsState({ initialTabId: 'tab-a', initialTabTitle: 'first.json' }));

    expect(result.current.tabs).toEqual([{ id: 'tab-a', title: 'first.json' }]);
    expect(result.current.activeTabId).toBe('tab-a');
    expect(result.current.documentMetaByTab['tab-a']).toMatchObject({ rawLength: 0, formattedLength: 0 });
    expect(result.current.errorsByTab['tab-a']).toBeNull();
    expect(result.current.importingByTab['tab-a']).toBeNull();
    expect(result.current.isFormattingByTab['tab-a']).toBe(false);
    expect(result.current.largeModeByTab['tab-a']).toBe(false);
    expect(result.current.largeFileLocateEnabledByTab['tab-a']).toBe(false);
    expect(result.current.structureStatusByTab['tab-a']).toBe('ready');
  });

  it('initializes, updates, and removes all state for a second tab', () => {
    const { result } = renderHook(() => useJsonToolTabsState({ initialTabId: 'tab-a', initialTabTitle: 'first.json' }));

    act(() => {
      result.current.initializeTabState('tab-b');
      result.current.setTabError('tab-b', 'broken');
      result.current.setTabImporting('tab-b', 'large.json');
      result.current.setTabFormatting('tab-b', true);
      result.current.setTabLargeModeState('tab-b', true);
      result.current.setLargeFileLocateEnabledState('tab-b', true);
      result.current.setStructureStatusState('tab-b', 'building');
      result.current.setDocumentMeta('tab-b', (current) => ({ ...current, rawLength: 42, rawRevision: 1 }));
    });

    expect(result.current.errorsByTab['tab-b']).toBe('broken');
    expect(result.current.importingByTab['tab-b']).toBe('large.json');
    expect(result.current.isFormattingByTab['tab-b']).toBe(true);
    expect(result.current.largeModeByTab['tab-b']).toBe(true);
    expect(result.current.largeFileLocateEnabledByTab['tab-b']).toBe(true);
    expect(result.current.structureStatusByTab['tab-b']).toBe('building');
    expect(result.current.documentMetaByTab['tab-b']).toMatchObject({ rawLength: 42, rawRevision: 1 });

    act(() => result.current.removeTabState('tab-b'));

    expect(result.current.errorsByTab).not.toHaveProperty('tab-b');
    expect(result.current.importingByTab).not.toHaveProperty('tab-b');
    expect(result.current.isFormattingByTab).not.toHaveProperty('tab-b');
    expect(result.current.largeModeByTab).not.toHaveProperty('tab-b');
    expect(result.current.largeFileLocateEnabledByTab).not.toHaveProperty('tab-b');
    expect(result.current.structureStatusByTab).not.toHaveProperty('tab-b');
    expect(result.current.documentMetaByTab).not.toHaveProperty('tab-b');
  });

  it('finishes or cancels tab renaming without losing the fallback title', () => {
    const { result } = renderHook(() => useJsonToolTabsState({ initialTabId: 'tab-a', initialTabTitle: 'first.json' }));

    act(() => {
      result.current.startRenamingTab(result.current.tabs[0]);
      result.current.handleRenamingChange('  renamed.json  ');
    });
    act(() => result.current.finishRenaming());
    expect(result.current.tabs[0].title).toBe('renamed.json');
    expect(result.current.renamingTab).toBeNull();

    act(() => {
      result.current.startRenamingTab(result.current.tabs[0]);
      result.current.handleRenamingChange('cancelled.json');
      result.current.cancelRenaming();
    });
    expect(result.current.tabs[0].title).toBe('renamed.json');

    act(() => result.current.renameTab('tab-a', '   '));
    expect(result.current.tabs[0].title).toBe(DEFAULT_TAB_TITLE);
  });

  it('allows the active tab and tab list to be changed together', () => {
    const { result } = renderHook(() => useJsonToolTabsState({ initialTabId: 'tab-a', initialTabTitle: 'first.json' }));

    act(() => {
      result.current.setTabs((tabs) => [...tabs, { id: 'tab-b', title: 'second.json' }]);
      result.current.setActiveTabId('tab-b');
    });

    expect(result.current.tabs.map((tab) => tab.id)).toEqual(['tab-a', 'tab-b']);
    expect(result.current.activeTabId).toBe('tab-b');
  });
});
