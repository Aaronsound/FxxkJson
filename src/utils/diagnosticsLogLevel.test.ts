// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getDiagnosticsLogLevel, isErrorDiagnosticsLogLine } from './diagnosticsLogLevel';

describe('diagnosticsLogLevel', () => {
  it('classifies diagnostic events', () => {
    expect(getDiagnosticsLogLevel('format-timeout')).toBe('error');
    expect(getDiagnosticsLogLevel('worker-error')).toBe('error');
    expect(getDiagnosticsLogLevel('blocked-navigation')).toBe('warn');
    expect(getDiagnosticsLogLevel('format-success')).toBe('info');
  });

  it('detects error log lines by level, event, and legacy text', () => {
    expect(isErrorDiagnosticsLogLine('[2026] {"event":"format-success","level":"info"}')).toBe(false);
    expect(isErrorDiagnosticsLogLine('[2026] {"event":"format-success","level":"error"}')).toBe(true);
    expect(isErrorDiagnosticsLogLine('[2026] {"event":"format-timeout"}')).toBe(true);
    expect(isErrorDiagnosticsLogLine('[2026] plain timeout line')).toBe(true);
  });
});
