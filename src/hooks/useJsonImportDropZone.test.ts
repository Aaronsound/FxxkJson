import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useJsonImportDropZone } from './useJsonImportDropZone';

function createDragEvent(files: File[] = [], types: string[] = ['Files']) {
  return {
    dataTransfer: { dropEffect: 'none', files, types },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('useJsonImportDropZone', () => {
  it('keeps the drop target active until every nested drag has left', () => {
    const { result } = renderHook(() =>
      useJsonImportDropZone({
        activeTab: { id: 'tab-a', title: 'a.json' },
        importJsonFile: vi.fn(),
        setTabError: vi.fn(),
      })
    );
    const event = createDragEvent();

    act(() => {
      result.current.handleImportDragEnter(event as never);
      result.current.handleImportDragEnter(event as never);
    });
    expect(result.current.isDragImportActive).toBe(true);

    act(() => result.current.handleImportDragLeave(event as never));
    expect(result.current.isDragImportActive).toBe(true);

    act(() => result.current.handleImportDragLeave(event as never));
    expect(result.current.isDragImportActive).toBe(false);
  });

  it('imports the first supported file into the active tab', async () => {
    const importJsonFile = vi.fn().mockResolvedValue(undefined);
    const setTabError = vi.fn();
    const { result } = renderHook(() =>
      useJsonImportDropZone({ activeTab: { id: 'tab-a', title: 'a.json' }, importJsonFile, setTabError })
    );
    const file = new File(['{"ok":true}'], 'sample.json', { type: 'application/json' });
    const event = createDragEvent([file]);

    await act(() => result.current.handleImportDrop(event as never));

    expect(importJsonFile).toHaveBeenCalledWith('tab-a', file);
    expect(setTabError).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('reports unsupported files and ignores drags without files', async () => {
    const importJsonFile = vi.fn().mockResolvedValue(undefined);
    const setTabError = vi.fn();
    const { result } = renderHook(() =>
      useJsonImportDropZone({ activeTab: { id: 'tab-a', title: 'a.json' }, importJsonFile, setTabError })
    );

    await act(() => result.current.handleImportDrop(createDragEvent([new File(['x'], 'sample.png')]) as never));
    act(() => result.current.handleImportDragEnter(createDragEvent([], ['text/plain']) as never));

    expect(setTabError).toHaveBeenCalledWith('tab-a', '请拖入 .json 或 .txt 文件');
    expect(importJsonFile).not.toHaveBeenCalled();
    expect(result.current.isDragImportActive).toBe(false);
  });
});
