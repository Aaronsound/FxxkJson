import { describe, expect, it, vi } from 'vitest';
import { captureElectronScreenshot } from './e2e-screenshot.mjs';

describe('bounded hidden Electron screenshots', () => {
  it('returns the image and forwards screenshot options', async () => {
    const cdp = { send: vi.fn(async () => ({ data: 'image' })) };
    expect(await captureElectronScreenshot(cdp, { captureBeyondViewport: true })).toEqual({ data: 'image' });
    expect(cdp.send).toHaveBeenCalledWith('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  });
  it('stops waiting when the hidden renderer does not answer', async () => {
    const cdp = { send: () => new Promise(() => {}) };
    await expect(captureElectronScreenshot(cdp, {}, 10)).rejects.toThrow('Electron screenshot timed out');
  });
  it('preserves protocol errors', async () => {
    const cdp = {
      send: async () => {
        throw new Error('closed');
      },
    };
    await expect(captureElectronScreenshot(cdp)).rejects.toThrow('closed');
  });
});
