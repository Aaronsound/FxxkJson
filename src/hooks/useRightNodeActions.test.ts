import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJsonValueClipboardText, useRightNodeActions } from './useRightNodeActions';

function createArgs() {
  return {
    applyRawUpdate: vi.fn(),
    getTabContent: vi.fn(() => '{"name":"old"}'),
    logEvent: vi.fn(),
    queueFormatAfterEditSave: vi.fn(),
    readEditableNodeAtOffset: vi.fn().mockResolvedValue({
      path: ['name'],
      value: '"alpha"',
    }),
    requestDeleteConfirmation: vi.fn().mockResolvedValue(true),
    requestRenameKey: vi.fn().mockResolvedValue('nextName'),
    requestWorkerEditJson: vi.fn().mockResolvedValue('{"nextName":"alpha"}'),
    resetSearchState: vi.fn(),
    setEditJsonBusyLabel: vi.fn(),
    setTabError: vi.fn(),
  };
}

describe('getJsonValueClipboardText', () => {
  afterEach(() => {
    window.electronAPI = undefined;
  });

  it('copies string values without JSON quotes', () => {
    expect(getJsonValueClipboardText('"alpha"')).toBe('alpha');
    expect(getJsonValueClipboardText('"line\\nbreak"')).toBe('line\nbreak');
  });

  it('keeps non-string values as JSON literals', () => {
    expect(getJsonValueClipboardText('{"ok":true}')).toBe('{"ok":true}');
    expect(getJsonValueClipboardText('[1,2]')).toBe('[1,2]');
    expect(getJsonValueClipboardText('42')).toBe('42');
    expect(getJsonValueClipboardText('null')).toBe('null');
  });

  it('copies right node values through the desktop clipboard', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(true);
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      openJsonFile: vi.fn(),
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText,
    };
    const args = createArgs();
    const { result } = renderHook(() => useRightNodeActions(args));

    await act(async () => {
      await result.current.copyValueAtOffset('tab-a', 4, true);
    });

    expect(args.readEditableNodeAtOffset).toHaveBeenCalledWith('tab-a', 4, true, '未找到可复制的 JSON 值');
    expect(writeClipboardText).toHaveBeenCalledWith('alpha');
    expect(args.setTabError).toHaveBeenCalledWith('tab-a', null);
    expect(args.logEvent).toHaveBeenCalledWith('copy-value-success', expect.objectContaining({ copiedLength: 5 }));
  });

  it('copies node detail variants and reports failures', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(true);
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      openJsonFile: vi.fn(),
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText,
    };
    const args = createArgs();
    const { result } = renderHook(() => useRightNodeActions(args));

    await act(async () => {
      await result.current.copyNodeDetailAtOffset('tab-a', 4, false, 'path');
      await result.current.copyNodeDetailAtOffset('tab-a', 4, false, 'key');
      await result.current.copyNodeDetailAtOffset('tab-a', 4, false, 'formatted-json');
    });

    expect(writeClipboardText).toHaveBeenCalledWith('$.name');
    expect(writeClipboardText).toHaveBeenCalledWith('name');
    expect(writeClipboardText).toHaveBeenCalledWith('"alpha"');

    args.readEditableNodeAtOffset.mockRejectedValueOnce(new Error('missing'));
    await act(async () => {
      await result.current.copyNodeDetailAtOffset('tab-a', 8, false, 'compact-json');
    });

    expect(args.setTabError).toHaveBeenCalledWith('tab-a', '复制压缩 JSON失败：missing');
    expect(args.logEvent).toHaveBeenCalledWith(
      'copy-node-detail-failed',
      expect.objectContaining({ error: 'missing' })
    );
  });

  it('applies delete and rename mutations through the worker', async () => {
    const args = createArgs();
    const { result } = renderHook(() => useRightNodeActions(args));

    await act(async () => {
      await result.current.applyRightNodeMutationAtOffset('tab-a', 4, true, 'delete-node');
    });

    expect(args.requestDeleteConfirmation).toHaveBeenCalledWith(['name'], '"alpha"');
    expect(args.requestWorkerEditJson).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'delete-node', originalText: '{"name":"old"}', path: ['name'] })
    );
    expect(args.applyRawUpdate).toHaveBeenCalledWith('tab-a', '{"nextName":"alpha"}');
    expect(args.queueFormatAfterEditSave).toHaveBeenCalledWith('tab-a', '{"nextName":"alpha"}');

    await act(async () => {
      await result.current.applyRightNodeMutationAtOffset('tab-a', 4, false, 'rename-node-key');
    });

    expect(args.requestRenameKey).toHaveBeenCalledWith(['name'], 'name');
    expect(args.requestWorkerEditJson).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'rename-node-key', text: 'nextName' })
    );
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });
});
