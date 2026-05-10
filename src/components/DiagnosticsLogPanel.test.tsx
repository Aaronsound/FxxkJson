import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      clearLog: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      showLogFile: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      openJsonFile: vi.fn().mockResolvedValue(null),
    };

    render(<DiagnosticsLogPanel isDarkMode={false} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/format-success/)).toBeInTheDocument();
    });
    expect(screen.getByText('/tmp/hanjson/runtime.log')).toBeInTheDocument();
    expect(window.electronAPI.readRecentLog).toHaveBeenCalledWith(160 * 1024);
  });

  it('filters error lines and copies a diagnostic summary', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    window.electronAPI = {
      appendLog: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      readRecentLog: vi.fn().mockResolvedValue({
        path: '/tmp/hanjson/runtime.log',
        content: [
          '[2026-05-09] {"event":"format-success"}',
          '[2026-05-09] {"event":"format-failed","error":"bad json"}',
        ].join('\n'),
        truncated: true,
      }),
      clearLog: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      showLogFile: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      openJsonFile: vi.fn().mockResolvedValue(null),
    };

    render(
      <DiagnosticsLogPanel
        isDarkMode={false}
        context={[
          { label: 'tabTitle', value: 'large-sample.json' },
          { label: 'rawBytes', value: 20_000_000 },
          { label: 'performanceStatus', value: 'failed' },
        ]}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue(/format-success/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('只看错误'));

    expect(screen.getByDisplayValue(/format-failed/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/format-success/)).not.toBeInTheDocument();

    expect(screen.getByText(/标签 large-sample.json/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('复制诊断包'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('HanJson diagnostics summary'));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('format-failed'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('tabTitle=large-sample.json'));
  });

  it('clears the desktop runtime log', async () => {
    window.electronAPI = {
      appendLog: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      readRecentLog: vi.fn().mockResolvedValue({
        path: '/tmp/hanjson/runtime.log',
        content: '[2026-05-09] {"event":"format-success"}',
        truncated: false,
      }),
      clearLog: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      showLogFile: vi.fn().mockResolvedValue('/tmp/hanjson/runtime.log'),
      openJsonFile: vi.fn().mockResolvedValue(null),
    };

    render(<DiagnosticsLogPanel isDarkMode={false} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/format-success/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('清空日志'));

    await waitFor(() => {
      expect(window.electronAPI?.clearLog).toHaveBeenCalled();
    });
    expect(screen.getByDisplayValue('暂无日志')).toBeInTheDocument();
  });
});
