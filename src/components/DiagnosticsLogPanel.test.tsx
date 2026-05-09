import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DiagnosticsLogPanel from './DiagnosticsLogPanel';

describe('DiagnosticsLogPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.electronAPI = undefined;
  });

  it('reads and renders the recent desktop runtime log', async () => {
    window.electronAPI = {
      appendLog: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      readRecentLog: vi.fn().mockResolvedValue({
        path: '/tmp/hanjson/runtime.log',
        content: '[2026-05-09] {"event":"format-success"}',
        truncated: false,
      }),
      showLogFile: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
    };

    render(<DiagnosticsLogPanel isDarkMode={false} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/format-success/)).toBeInTheDocument();
    });
    expect(screen.getByText('/tmp/hanjson/runtime.log')).toBeInTheDocument();
    expect(window.electronAPI.readRecentLog).toHaveBeenCalledWith(160 * 1024);
  });
});
