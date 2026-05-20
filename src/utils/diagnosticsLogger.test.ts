import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDiagnosticsConsoleEnabled, logDiagnosticsToConsole } from './diagnosticsLogger';

describe('diagnosticsLogger', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps diagnostics console logging off by default', () => {
    expect(isDiagnosticsConsoleEnabled()).toBe(false);
  });

  it('logs diagnostics only when the local switch is enabled', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logDiagnosticsToConsole('event', { ok: true });
    expect(info).not.toHaveBeenCalled();

    window.localStorage.setItem('fxxkjson.diagnostics.console.v1', 'true');
    logDiagnosticsToConsole('event', { ok: true });
    expect(info).toHaveBeenCalledWith('[FxxkJson][event]', { ok: true });
  });
});
