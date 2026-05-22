import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import JsonPerformancePanel from './JsonPerformancePanel';
import type { PerformanceSnapshot } from '../types/jsonTool';

function buildSnapshot(overrides: Partial<PerformanceSnapshot> = {}): PerformanceSnapshot {
  return {
    error: null,
    fileSizeBytes: 2_097_329,
    formatQueueMs: 0.2,
    formatWorkerMs: 621.3,
    formattedBytes: 2_871_042,
    largeMode: true,
    leftModelSyncMs: 524.9,
    rawBytes: 2_097_329,
    readFileMs: 4.3,
    rightModelSyncMs: 2249.6,
    runId: 'test-run',
    sourceLabel: 'sample-2mb.json',
    status: 'ready',
    structureEnabled: false,
    structureIndexMs: null,
    totalToFormattedMs: 3753.4,
    totalToViewerReadyMs: 3848.7,
    trigger: 'import',
    updatedAt: 1778998545302,
    viewerIndexMs: 12.1,
    ...overrides,
  };
}

describe('JsonPerformancePanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('explains when right pane rendering is the bottleneck', () => {
    render(<JsonPerformancePanel snapshot={buildSnapshot()} history={[]} isDarkMode={false} />);

    expect(screen.getByText(/当前慢在右侧渲染/)).toBeInTheDocument();
    expect(screen.getByText('瓶颈 右侧渲染')).toBeInTheDocument();
  });

  it('shows an anchored waiting state before any performance snapshot exists', () => {
    const { container } = render(<JsonPerformancePanel snapshot={null} history={[]} isDarkMode={false} />);
    const panel = container.querySelector('.performance-panel') as HTMLElement;

    expect(screen.getByText('等待数据')).toBeInTheDocument();
    expect(screen.getByText(/显示性能数据/)).toBeInTheDocument();
    expect(panel.style.left).toBe('');
    expect(panel.style.top).toBe('');
  });

  it('returns a dragged panel to its bottom-right anchor on viewport resize', async () => {
    const { container } = render(<JsonPerformancePanel snapshot={buildSnapshot()} history={[]} isDarkMode={false} />);
    const panel = container.querySelector('.performance-panel') as HTMLElement;
    const topbar = container.querySelector('.performance-panel-topbar') as HTMLElement;
    panel.getBoundingClientRect = () =>
      ({
        bottom: 200,
        height: 120,
        left: 40,
        right: 400,
        top: 80,
        width: 360,
        x: 40,
        y: 80,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.pointerDown(topbar, { clientX: 72, clientY: 96 });

    await waitFor(() => {
      expect(panel.style.left).toBe('40px');
      expect(panel.style.top).toBe('80px');
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(panel.style.left).toBe('');
      expect(panel.style.top).toBe('');
    });
  });
});
