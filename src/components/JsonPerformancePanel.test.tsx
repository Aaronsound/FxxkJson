import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
});
