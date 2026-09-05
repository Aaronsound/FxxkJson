import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useJsonImportActions } from './useJsonImportActions';
import { createJsonImportTasks } from '../utils/jsonImportTasks';

function createArgs() {
  return {
    beginImport: createJsonImportTasks().begin,
    activeTab: { id: 'tab-1', title: 'demo' },
    fileInputRef: { current: { click: vi.fn() } as unknown as HTMLInputElement },
    importJsonFile: vi.fn(),
    importJsonText: vi.fn(),
    setProcessingStage: vi.fn(),
    setTabError: vi.fn(),
    setTabImporting: vi.fn(),
  };
}

describe('useJsonImportActions', () => {
  it.each(['newer import', 'closed tab'])('ignores native file callbacks after %s', async (reason) => {
    const args = createArgs();
    const tasks = createJsonImportTasks();
    args.beginImport = tasks.begin;
    let selected: ((metadata: { name: string; path: string; size: number }) => void) | undefined;
    let finish!: (file: null) => void;
    window.electronAPI = {
      openJsonFile: vi.fn((onSelected) => {
        selected = onSelected;
        return new Promise<null>((resolve) => {
          finish = resolve;
        });
      }),
    } as unknown as NonNullable<Window['electronAPI']>;
    const { result } = renderHook(() => useJsonImportActions(args));
    const pending = result.current.handleImport();
    if (reason === 'closed tab') tasks.cancel('tab-1');
    else tasks.begin('tab-1');
    selected?.({ name: 'old.json', path: '/tmp/old.json', size: 2 });
    finish(null);
    await pending;
    expect(args.setTabImporting).not.toHaveBeenCalled();
    expect(args.setProcessingStage).not.toHaveBeenCalled();
    expect(args.importJsonText).not.toHaveBeenCalled();
  });
  afterEach(() => {
    window.electronAPI = undefined;
  });

  it('imports desktop file selections through Electron when available', async () => {
    const args = createArgs();
    const contentBuffer = new TextEncoder().encode('{"ok":true}').buffer;
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      onFindShortcut: vi.fn(),
      openJsonFile: vi.fn(async (onSelected) => {
        onSelected?.({ name: 'demo.json', path: '/tmp/demo.json', size: 7 });
        return {
          name: 'demo.json',
          path: '/tmp/demo.json',
          size: 7,
          content: '{"ok":true}',
          contentBuffer,
        };
      }),
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText: vi.fn(),
    };
    const { result } = renderHook(() => useJsonImportActions(args));

    await act(async () => {
      await result.current.handleImport();
    });

    expect(args.importJsonText).toHaveBeenCalledWith(
      'tab-1',
      'demo.json',
      7,
      '{"ok":true}',
      contentBuffer,
      expect.objectContaining({ isCurrent: expect.any(Function) })
    );
    expect(args.setTabImporting).toHaveBeenCalledWith('tab-1', 'demo.json');
    expect(args.setProcessingStage).toHaveBeenCalledWith('tab-1', 'reading');
    expect(args.fileInputRef.current?.click).not.toHaveBeenCalled();
  });

  it('clears the reading state when the desktop picker is cancelled', async () => {
    const args = createArgs();
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      onFindShortcut: vi.fn(),
      openJsonFile: vi.fn().mockResolvedValue(null),
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText: vi.fn(),
    };
    const { result } = renderHook(() => useJsonImportActions(args));

    await act(async () => {
      await result.current.handleImport();
    });

    expect(args.setTabImporting).toHaveBeenLastCalledWith('tab-1', null);
    expect(args.setProcessingStage).toHaveBeenLastCalledWith('tab-1', 'idle');
    expect(args.importJsonText).not.toHaveBeenCalled();
  });

  it('opens the browser picker and reports unsupported selected files', async () => {
    const args = createArgs();
    const { result } = renderHook(() => useJsonImportActions(args));

    await act(async () => {
      await result.current.handleImport();
      await result.current.handleFileSelection({
        target: {
          files: [new File(['text'], 'demo.md')] as unknown as FileList,
          value: 'demo.md',
        },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(args.fileInputRef.current?.click).toHaveBeenCalledTimes(1);
    expect(args.setTabError).toHaveBeenCalledWith('tab-1', '请选择 .json 或 .txt 文件');
  });
});
