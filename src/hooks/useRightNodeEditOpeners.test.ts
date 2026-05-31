import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRightNodeEditOpeners } from './useRightNodeEditOpeners';

function nodePayload(value: string) {
  return JSON.stringify({
    path: ['items', 0, 'payload'],
    value,
  });
}

function createArgs() {
  return {
    formattedTextByTabRef: { current: { 'tab-1': '{ "items": [] }' } },
    openNodeEditSession: vi.fn(),
    requestWorkerEditJson: vi.fn(),
    setEditJsonBusyLabel: vi.fn(),
    setTabError: vi.fn(),
  };
}

describe('useRightNodeEditOpeners', () => {
  it('falls back to formatted text when cached node reads are unavailable', async () => {
    const args = createArgs();
    args.requestWorkerEditJson
      .mockRejectedValueOnce(new Error('cache miss'))
      .mockResolvedValueOnce(nodePayload('"cached fallback"'));
    const { result } = renderHook(() => useRightNodeEditOpeners(args));

    await expect(result.current.readEditableNodeAtOffset('tab-1', 12, true, 'bad node')).resolves.toEqual({
      path: ['items', 0, 'payload'],
      value: '"cached fallback"',
    });

    expect(args.requestWorkerEditJson).toHaveBeenNthCalledWith(1, {
      tabId: 'tab-1',
      operation: 'read-node',
      text: '',
      offset: 12,
    });
    expect(args.requestWorkerEditJson).toHaveBeenNthCalledWith(2, {
      tabId: 'tab-1',
      operation: 'read-node',
      text: '{ "items": [] }',
      offset: 12,
    });
  });

  it('opens a node edit session from the worker payload', async () => {
    const args = createArgs();
    args.requestWorkerEditJson.mockResolvedValue(nodePayload('{"ok":true}'));
    const { result } = renderHook(() => useRightNodeEditOpeners(args));

    await act(async () => {
      await result.current.handleOpenEditNodeAtOffset('tab-1', 4);
    });

    expect(args.openNodeEditSession).toHaveBeenCalledWith('{"ok":true}', ['items', 0, 'payload']);
    expect(args.setEditJsonBusyLabel).toHaveBeenNthCalledWith(1, '正在准备当前节点...');
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });

  it('reports unescape attempts on non-string nodes', async () => {
    const args = createArgs();
    args.requestWorkerEditJson.mockResolvedValue(nodePayload('{"ok":true}'));
    const { result } = renderHook(() => useRightNodeEditOpeners(args));

    await act(async () => {
      await result.current.handleOpenUnescapedNodeAtOffset('tab-1', 4);
    });

    expect(args.openNodeEditSession).not.toHaveBeenCalled();
    expect(args.setTabError).toHaveBeenCalledWith('tab-1', '反转义当前节点失败：当前节点不是字符串值');
  });
});
