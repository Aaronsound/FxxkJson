export type DiagnosticsLogLevel = 'info' | 'warn' | 'error';

const ERROR_EVENT_PATTERN = /(failed|error|timeout|stalled|gone|exception|rejection)/i;
const WARN_EVENT_PATTERN = /(blocked|warning|fallback|disabled)/i;
const LEGACY_ERROR_LINE_PATTERN =
  /("event"\s*:\s*"[^"]*(failed|error|timeout|stalled|gone|exception|rejection)|\b(failed|error|timeout|stalled|exception|rejection)\b|失败|异常|超时|卡住)/i;

export function getDiagnosticsLogLevel(event: string): DiagnosticsLogLevel {
  if (ERROR_EVENT_PATTERN.test(event)) {
    return 'error';
  }

  if (WARN_EVENT_PATTERN.test(event)) {
    return 'warn';
  }

  return 'info';
}

function parseLogJson(line: string) {
  const jsonStart = line.indexOf('{');
  if (jsonStart < 0) {
    return null;
  }

  try {
    return JSON.parse(line.slice(jsonStart)) as { event?: unknown; level?: unknown };
  } catch {
    return null;
  }
}

export function isErrorDiagnosticsLogLine(line: string) {
  const parsed = parseLogJson(line);
  if (parsed?.level === 'error') {
    return true;
  }

  if (typeof parsed?.event === 'string' && getDiagnosticsLogLevel(parsed.event) === 'error') {
    return true;
  }

  return LEGACY_ERROR_LINE_PATTERN.test(line);
}
