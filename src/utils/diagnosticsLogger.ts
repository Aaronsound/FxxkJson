const DIAGNOSTICS_CONSOLE_STORAGE_KEY = 'hanjson.diagnostics.console.v1';

export function isDiagnosticsConsoleEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(DIAGNOSTICS_CONSOLE_STORAGE_KEY) === 'true';
}

export function logDiagnosticsToConsole(event: string, payload: Record<string, unknown>) {
  if (!isDiagnosticsConsoleEnabled()) {
    return;
  }

  console.info(`[HanJson][${event}]`, payload);
}
