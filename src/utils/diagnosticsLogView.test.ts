// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildDiagnosticsIssueSummary,
  buildDiagnosticsLogViewState,
  getFilteredDiagnosticsLogLines,
} from './diagnosticsLogView';

const logContent = [
  '[2026] {"event":"format-success","level":"info"}',
  '[2026] {"event":"format-failed","level":"error","error":"bad"}',
  '[2026] {"event":"fallback-format","level":"info"}',
  '[2026] {"event":"performance-snapshot","level":"info"}',
].join('\n');

describe('diagnosticsLogView', () => {
  it('filters diagnostics logs by category', () => {
    expect(getFilteredDiagnosticsLogLines(logContent, 'error')).toContain('format-failed');
    expect(getFilteredDiagnosticsLogLines(logContent, 'warn')).toContain('fallback-format');
    expect(getFilteredDiagnosticsLogLines(logContent, 'performance')).toContain('performance-snapshot');
    expect(getFilteredDiagnosticsLogLines(logContent, 'all')).toBe(logContent);
  });

  it('builds preview text and meta counts for the selected filter', () => {
    const viewState = buildDiagnosticsLogViewState({
      context: [
        { label: 'tabTitle', value: 'large.json' },
        { label: 'rawBytes', value: 1024 },
        { label: 'performanceStatus', value: 'ready' },
      ],
      filter: 'performance',
      isLoading: false,
      logContent,
      snapshot: { path: '/tmp/runtime.log', content: logContent, truncated: true },
    });

    expect(viewState.previewText).toContain('performance-snapshot');
    expect(viewState.displayContent).not.toContain('format-failed');
    expect(viewState.metaText).toContain('日志行 4');
    expect(viewState.metaText).toContain('错误 1');
    expect(viewState.metaText).toContain('警告 1');
    expect(viewState.metaText).toContain('性能 1');
    expect(viewState.metaText).toContain('标签 large.json');
  });

  it('builds a copyable diagnostics issue summary', () => {
    expect(
      buildDiagnosticsIssueSummary({ path: '/tmp/runtime.log', content: logContent, truncated: false }, 'excerpt', [
        { label: 'tabTitle', value: 'demo.json' },
      ])
    ).toContain('tabTitle=demo.json');
  });
});
