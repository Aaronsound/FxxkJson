import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureText, renderViewer, requireElement } from './LargeJsonReadonlyViewer.testUtils';

describe('LargeJsonReadonlyViewer context menu', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses right-side clicks and context menu actions for locate, copy, and edit callbacks', async () => {
    const onLocateOffset = vi.fn();
    const onCopyPath = vi.fn().mockResolvedValue(undefined);
    const onCopyKey = vi.fn().mockResolvedValue(undefined);
    const onCopyValue = vi.fn().mockResolvedValue(undefined);
    const onCopyCompactJson = vi.fn().mockResolvedValue(undefined);
    const onCopyFormattedJson = vi.fn().mockResolvedValue(undefined);
    const onEditValue = vi.fn().mockResolvedValue(undefined);
    const onDeleteValue = vi.fn().mockResolvedValue(undefined);
    const onRenameKey = vi.fn().mockResolvedValue(undefined);
    const onUnescapeValue = vi.fn().mockResolvedValue(undefined);

    renderViewer({
      onLocateOffset,
      onCopyPath,
      onCopyKey,
      onCopyValue,
      onCopyCompactJson,
      onCopyFormattedJson,
      onEditValue,
      onDeleteValue,
      onRenameKey,
      onUnescapeValue,
    });

    const line = requireElement('.large-json-line-text[title*="alpha"]');
    fireEvent.mouseUp(line, { button: 0 });
    expect(onLocateOffset).toHaveBeenCalledTimes(1);
    expect(onLocateOffset).toHaveBeenLastCalledWith(expect.any(Number));

    const keyToken = requireElement('.large-json-line-text[title*="alpha"] .large-json-token-key');

    const alphaLineStart = fixtureText.indexOf('  "name"');
    fireEvent.mouseUp(keyToken, { button: 0 });
    expect(onLocateOffset).toHaveBeenCalledTimes(2);
    expect(onLocateOffset).toHaveBeenLastCalledWith(expect.any(Number));
    expect(onLocateOffset.mock.calls[1][0]).toBeGreaterThan(alphaLineStart);

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '复制值' }));

    await waitFor(() => {
      expect(onCopyValue).toHaveBeenCalledTimes(1);
    });
    expect(onCopyValue).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '复制 JSON Path' }));

    await waitFor(() => {
      expect(onCopyPath).toHaveBeenCalledTimes(1);
    });
    expect(onCopyPath).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '复制 key' }));

    await waitFor(() => {
      expect(onCopyKey).toHaveBeenCalledTimes(1);
    });
    expect(onCopyKey).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '复制压缩 JSON' }));

    await waitFor(() => {
      expect(onCopyCompactJson).toHaveBeenCalledTimes(1);
    });
    expect(onCopyCompactJson).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '复制格式化 JSON' }));

    await waitFor(() => {
      expect(onCopyFormattedJson).toHaveBeenCalledTimes(1);
    });
    expect(onCopyFormattedJson).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '编辑当前值' }));

    await waitFor(() => {
      expect(onEditValue).toHaveBeenCalledTimes(1);
    });
    expect(onEditValue).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '重命名 key' }));

    await waitFor(() => {
      expect(onRenameKey).toHaveBeenCalledTimes(1);
    });
    expect(onRenameKey).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '删除当前节点' }));

    await waitFor(() => {
      expect(onDeleteValue).toHaveBeenCalledTimes(1);
    });
    expect(onDeleteValue).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    fireEvent.click(await screen.findByRole('button', { name: '反转义当前值' }));

    await waitFor(() => {
      expect(onUnescapeValue).toHaveBeenCalledTimes(1);
    });
    expect(onUnescapeValue).toHaveBeenLastCalledWith(expect.any(Number));
  });

  it('keeps the context menu inside the viewport near the bottom edge', () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });

    try {
      renderViewer();

      const firstLine = requireElement('.large-json-line-text[data-line-number="1"]');

      fireEvent.contextMenu(firstLine, { clientX: 790, clientY: 590 });

      const menu = document.querySelector<HTMLElement>('.large-json-context-menu');
      expect(menu?.style.left).toBe('612px');
      expect(menu?.style.top).toBe('240px');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
    }
  });
});
