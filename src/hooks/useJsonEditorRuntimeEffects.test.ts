import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LargeViewerStatus } from '../types/jsonTool';
import { useJsonEditorRuntimeEffects } from './useJsonEditorRuntimeEffects';

function createArgs() {
  return {
    activeDocumentMeta: { formattedLength: 24, rawLength: 12 },
    activeLargeViewerData: null,
    activeLargeViewerStatus: 'idle' as LargeViewerStatus,
    activeTab: { id: 'tab-a', title: 'a.json' },
    activeTabId: 'tab-a',
    activeTabIdRef: { current: 'tab-old' } as MutableRefObject<string>,
    formattedTextByTabRef: { current: { 'tab-a': '{\n  "ok": true\n}' } } as MutableRefObject<Record<string, string>>,
    getTabContent: vi.fn(() => '{"ok":true}'),
    isBuildingDedicatedRightViewer: false,
    isLargeFileMode: false,
    logRightEditorState: vi.fn(),
    shouldEnableRightPaneFolding: true,
    shouldUseDedicatedRightViewer: false,
    syncLeftModel: vi.fn(),
    syncRightModel: vi.fn(),
    wrapLongLines: false,
  };
}

describe('useJsonEditorRuntimeEffects', () => {
  it('synchronizes both models and the active tab reference', () => {
    const args = createArgs();

    renderHook(() => useJsonEditorRuntimeEffects(args));

    expect(args.activeTabIdRef.current).toBe('tab-a');
    expect(args.syncLeftModel).toHaveBeenCalledWith('tab-a', '{"ok":true}', false, 12);
    expect(args.syncRightModel).toHaveBeenCalledWith('tab-a', '{\n  "ok": true\n}', false, 24, 12);
    expect(args.logRightEditorState).toHaveBeenCalledWith(
      'right-editor-options-refreshed',
      'tab-a',
      expect.objectContaining({ shouldEnableRightPaneFolding: true })
    );
  });

  it('uses updated synchronization callbacks without retaining stale closures', () => {
    const initial = createArgs();
    const { rerender } = renderHook((args) => useJsonEditorRuntimeEffects(args), { initialProps: initial });
    const syncLeftModel = vi.fn();
    const syncRightModel = vi.fn();

    rerender({ ...initial, syncLeftModel, syncRightModel });

    expect(syncLeftModel).toHaveBeenCalled();
    expect(syncRightModel).toHaveBeenCalled();
  });
});
