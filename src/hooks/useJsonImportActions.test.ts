import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useJsonImportActions } from './useJsonImportActions';

function createArgs() {
  return {
    activeTab: { id: 'tab-1', title: 'demo' },
    fileInputRef: { current: { click: vi.fn() } as unknown as HTMLInputElement },
    importJsonFile: vi.fn(),
    importJsonText: vi.fn(),
    setTabError: vi.fn(),
  };
}

describe('useJsonImportActions', () => {
  afterEach(() => {
    window.electronAPI = undefined;
  });

  it('imports desktop file selections through Electron when available', async () => {
    const args = createArgs();
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      onFindShortcut: vi.fn(),
      openJsonFile: vi.fn().mockResolvedValue({ name: 'demo.json', size: 7, content: '{"ok":true}' }),
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText: vi.fn(),
    };
    const { result } = renderHook(() => useJsonImportActions(args));

    await act(async () => {
      await result.current.handleImport();
    });

    expect(args.importJsonText).toHaveBeenCalledWith('tab-1', 'demo.json', 7, '{"ok":true}');
    expect(args.fileInputRef.current?.click).not.toHaveBeenCalled();
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
