import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DiagnosticsLogPanel from './DiagnosticsLogPanel';
import { createTranslator } from '../utils/i18n';

describe('DiagnosticsLogPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.electronAPI = undefined;
  });

  it('reads and renders the recent desktop runtime log', async () => {
    window.electronAPI = {
      appendLog: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      readRecentLog: vi.fn().mockResolvedValue({
        path: '/tmp/fxxkjson/runtime.log',
        content: '[2026-05-09] {"event":"format-success"}',
        truncated: false,
      }),
      clearLog: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      showLogFile: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      writeClipboardText: vi.fn().mockResolvedValue(true),
      openJsonFile: vi.fn().mockResolvedValue(null),
    };

    render(<DiagnosticsLogPanel isDarkMode={false} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/format-success/)).toBeInTheDocument();
    });
    expect(screen.getByText('/tmp/fxxkjson/runtime.log')).toBeInTheDocument();
    expect(window.electronAPI.readRecentLog).toHaveBeenCalledWith(160 * 1024);
  });

  it('filters error lines and copies a diagnostic summary', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(true);
    window.electronAPI = {
      appendLog: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      readRecentLog: vi.fn().mockResolvedValue({
        path: '/tmp/fxxkjson/runtime.log',
        content: [
          '[2026-05-09] {"event":"format-success","level":"info"}',
          '[2026-05-09] {"event":"format-failed","level":"error","error":"bad json"}',
          '[2026-05-09] {"event":"format-timeout","error":"JSON 格式化超时"}',
          '[2026-05-09] {"event":"fallback-format","level":"info"}',
          '[2026-05-09] {"event":"performance-snapshot","level":"info"}',
        ].join('\n'),
        truncated: true,
      }),
      clearLog: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      showLogFile: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      writeClipboardText,
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

    fireEvent.change(screen.getByLabelText('日志筛选'), { target: { value: 'error' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue(/format-failed/)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/format-timeout/)).toBeInTheDocument();
      expect(screen.queryByDisplayValue(/format-success/)).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue(/performance-snapshot/)).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('日志筛选'), { target: { value: 'performance' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue(/performance-snapshot/)).toBeInTheDocument();
      expect(screen.queryByDisplayValue(/format-failed/)).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('日志筛选'), { target: { value: 'error' } });

    expect(screen.getByText(/标签 large-sample.json/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('复制诊断包'));

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith(expect.stringContaining('FxxkJson diagnostics summary'));
    });
    expect(writeClipboardText).toHaveBeenCalledWith(expect.stringContaining('format-failed'));
    expect(writeClipboardText).toHaveBeenCalledWith(expect.stringContaining('tabTitle=large-sample.json'));
  });

  it('clears the desktop runtime log', async () => {
    window.electronAPI = {
      appendLog: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      readRecentLog: vi.fn().mockResolvedValue({
        path: '/tmp/fxxkjson/runtime.log',
        content: '[2026-05-09] {"event":"format-success"}',
        truncated: false,
      }),
      clearLog: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      showLogFile: vi.fn().mockResolvedValue('/tmp/fxxkjson/runtime.log'),
      writeClipboardText: vi.fn().mockResolvedValue(true),
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
    await waitFor(() => {
      expect(screen.getByDisplayValue('暂无日志')).toBeInTheDocument();
    });
  });

  it('renders diagnostics controls and empty states in English', async () => {
    render(<DiagnosticsLogPanel isDarkMode={false} onClose={vi.fn()} t={createTranslator('en')} />);

    expect(screen.getByRole('dialog', { name: 'Diagnostics log' })).toBeInTheDocument();
    expect(screen.getByLabelText('Log filter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/desktop logging interface is unavailable/)).toBeInTheDocument();
    });
  });
});
