import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTextFromClipboard, writeTextToClipboard } from './clipboard';

describe('clipboard helpers', () => {
  afterEach(() => {
    window.electronAPI = undefined;
    vi.restoreAllMocks();
  });

  it('uses the desktop clipboard bridge when available', async () => {
    const readClipboardText = vi.fn().mockResolvedValue('desktop text');
    const writeClipboardText = vi.fn().mockResolvedValue(true);
    window.electronAPI = {
      appendLog: vi.fn(),
      clearLog: vi.fn(),
      openJsonFile: vi.fn(),
      readClipboardText,
      readRecentLog: vi.fn(),
      showLogFile: vi.fn(),
      writeClipboardText,
    };

    await writeTextToClipboard('hello');

    expect(writeClipboardText).toHaveBeenCalledWith('hello');
    await expect(readTextFromClipboard()).resolves.toBe('desktop text');
  });

  it('falls back to the browser clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('browser text');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText, writeText },
    });

    await writeTextToClipboard('hello');

    expect(writeText).toHaveBeenCalledWith('hello');
    await expect(readTextFromClipboard()).resolves.toBe('browser text');
  });
});
