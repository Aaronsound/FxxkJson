import { getDiagnosticsLogLineCategory } from './diagnosticsLogLevel';

export type DiagnosticsLogFilter = 'all' | 'error' | 'warn' | 'performance';

export interface DiagnosticsContextItem {
  label: string;
  value: string | number | boolean | null | undefined;
}

export interface DiagnosticsLogViewState {
  displayContent: string;
  emptyFilterText: string;
  errorLogContent: string;
  metaText: string;
  performanceLogContent: string;
  previewText: string;
  warnLogContent: string;
}

export function getFilteredDiagnosticsLogLines(content: string, filter: DiagnosticsLogFilter) {
  if (filter === 'all') {
    return content;
  }

  return content
    .split('\n')
    .filter((line) => getDiagnosticsLogLineCategory(line) === filter)
    .join('\n');
}

export function formatDiagnosticsContextValue(value: DiagnosticsContextItem['value']) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return '(none)';
  }

  return String(value);
}

export function buildDiagnosticsIssueSummary(
  snapshot: RuntimeLogSnapshot | null,
  content: string,
  context: DiagnosticsContextItem[] = []
) {
  const path = snapshot?.path ?? 'runtime.log';
  const truncated = snapshot?.truncated ? 'yes' : 'no';
  const contextLines =
    context.length > 0
      ? context.map((item) => `${item.label}=${formatDiagnosticsContextValue(item.value)}`).join('\n')
      : '(no app context)';

  return [
    `FxxkJson diagnostics summary`,
    `logPath=${path}`,
    `truncated=${truncated}`,
    '',
    '[app-context]',
    contextLines,
    '',
    '[log-excerpt]',
    content || '(no matching log lines)',
  ].join('\n');
}

export function getDiagnosticsContextSummary(context: DiagnosticsContextItem[]) {
  if (context.length === 0) {
    return null;
  }

  const tabTitle = context.find((item) => item.label === 'tabTitle')?.value;
  const rawBytes = context.find((item) => item.label === 'rawBytes')?.value;
  const status = context.find((item) => item.label === 'performanceStatus')?.value;

  return [
    tabTitle ? `标签 ${tabTitle}` : null,
    typeof rawBytes === 'number' ? `原始 ${rawBytes.toLocaleString()} bytes` : null,
    status ? `状态 ${status}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function countDiagnosticsLogLines(content: string) {
  return content ? content.split('\n').length : 0;
}

export function getDiagnosticsEmptyFilterText(filter: DiagnosticsLogFilter) {
  if (filter === 'error') {
    return '没有匹配到错误日志';
  }

  if (filter === 'warn') {
    return '没有匹配到警告日志';
  }

  if (filter === 'performance') {
    return '没有匹配到性能日志';
  }

  return '暂无日志';
}

export function buildDiagnosticsLogViewState({
  context = [],
  filter,
  isLoading,
  logContent,
  snapshot,
}: {
  context?: DiagnosticsContextItem[];
  filter: DiagnosticsLogFilter;
  isLoading: boolean;
  logContent: string;
  snapshot: RuntimeLogSnapshot | null;
}): DiagnosticsLogViewState {
  const errorLogContent = getFilteredDiagnosticsLogLines(logContent, 'error');
  const warnLogContent = getFilteredDiagnosticsLogLines(logContent, 'warn');
  const performanceLogContent = getFilteredDiagnosticsLogLines(logContent, 'performance');
  const displayContent = getFilteredDiagnosticsLogLines(logContent, filter);
  const emptyFilterText = getDiagnosticsEmptyFilterText(filter);
  const contextSummary = getDiagnosticsContextSummary(context);
  const metaText = [
    snapshot?.truncated ? '显示最近日志片段' : '显示完整日志',
    `日志行 ${countDiagnosticsLogLines(logContent)}`,
    `错误 ${countDiagnosticsLogLines(errorLogContent)}`,
    `警告 ${countDiagnosticsLogLines(warnLogContent)}`,
    `性能 ${countDiagnosticsLogLines(performanceLogContent)}`,
    contextSummary,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    displayContent,
    emptyFilterText,
    errorLogContent,
    metaText,
    performanceLogContent,
    previewText: isLoading ? '正在读取日志...' : displayContent || emptyFilterText,
    warnLogContent,
  };
}
