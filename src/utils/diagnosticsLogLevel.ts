export type DiagnosticsLogLevel = 'info' | 'warn' | 'error';
export type DiagnosticsLogLineCategory = DiagnosticsLogLevel | 'performance';

const ERROR_EVENT_PATTERN = /(failed|error|timeout|stalled|gone|exception|rejection)/i;
const WARN_EVENT_PATTERN = /(blocked|warning|fallback|disabled)/i;
const LEGACY_ERROR_LINE_PATTERN =
  /("event"\s*:\s*"[^"]*(failed|error|timeout|stalled|gone|exception|rejection)|\b(failed|error|timeout|stalled|exception|rejection)\b|失败|异常|超时|卡住)/i;
const LEGACY_WARN_LINE_PATTERN = /(\b(blocked|warning|fallback|disabled)\b|警告|降级|禁用|阻止)/i;

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
    return JSON.parse(line.slice(jsonStart)) as { error?: unknown; event?: unknown; level?: unknown };
  } catch {
    return null;
  }
}

export function getDiagnosticsLogLineCategory(line: string): DiagnosticsLogLineCategory {
  const parsed = parseLogJson(line);
  if (parsed) {
    if (parsed.level === 'error') {
      return 'error';
    }

    if (typeof parsed.event === 'string') {
      const eventLevel = getDiagnosticsLogLevel(parsed.event);
      if (eventLevel === 'error') {
        return 'error';
      }
      if (parsed.event === 'performance-snapshot') {
        return 'performance';
      }
      if (eventLevel === 'warn') {
        return 'warn';
      }
    }

    if (typeof parsed.error !== 'undefined' && parsed.error !== null && parsed.error !== '') {
      return 'error';
    }

    if (parsed.level === 'warn') {
      return 'warn';
    }

    return 'info';
  }

  if (LEGACY_ERROR_LINE_PATTERN.test(line)) {
    return 'error';
  }

  if (LEGACY_WARN_LINE_PATTERN.test(line)) {
    return 'warn';
  }

  return 'info';
}

export function isErrorDiagnosticsLogLine(line: string) {
  return getDiagnosticsLogLineCategory(line) === 'error';
}
