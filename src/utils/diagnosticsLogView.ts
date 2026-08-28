import { getDiagnosticsLogLineCategory } from './diagnosticsLogLevel';
import { createTranslator, type I18nKey } from './i18n';

type Translator = (key: I18nKey, params?: Record<string, string | number>) => string;
const defaultT = createTranslator('zh');

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

export function getDiagnosticsContextSummary(context: DiagnosticsContextItem[], t: Translator = defaultT) {
  if (context.length === 0) {
    return null;
  }

  const tabTitle = context.find((item) => item.label === 'tabTitle')?.value;
  const rawBytes = context.find((item) => item.label === 'rawBytes')?.value;
  const status = context.find((item) => item.label === 'performanceStatus')?.value;

  return [
    tabTitle ? t('diagnostics.contextTab', { value: String(tabTitle) }) : null,
    typeof rawBytes === 'number' ? t('diagnostics.contextRaw', { value: rawBytes.toLocaleString() }) : null,
    status ? t('diagnostics.contextStatus', { value: String(status) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function countDiagnosticsLogLines(content: string) {
  return content ? content.split('\n').length : 0;
}

export function getDiagnosticsEmptyFilterText(filter: DiagnosticsLogFilter, t: Translator = defaultT) {
  if (filter === 'error') {
    return t('diagnostics.emptyError');
  }

  if (filter === 'warn') {
    return t('diagnostics.emptyWarn');
  }

  if (filter === 'performance') {
    return t('diagnostics.emptyPerformance');
  }

  return t('diagnostics.emptyAll');
}

export function buildDiagnosticsLogViewState(
  {
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
  },
  t: Translator = defaultT
): DiagnosticsLogViewState {
  const errorLogContent = getFilteredDiagnosticsLogLines(logContent, 'error');
  const warnLogContent = getFilteredDiagnosticsLogLines(logContent, 'warn');
  const performanceLogContent = getFilteredDiagnosticsLogLines(logContent, 'performance');
  const displayContent = getFilteredDiagnosticsLogLines(logContent, filter);
  const emptyFilterText = getDiagnosticsEmptyFilterText(filter, t);
  const contextSummary = getDiagnosticsContextSummary(context, t);
  const metaText = [
    snapshot?.truncated ? t('diagnostics.metaRecent') : t('diagnostics.metaFull'),
    t('diagnostics.metaLines', { count: countDiagnosticsLogLines(logContent) }),
    t('diagnostics.metaErrors', { count: countDiagnosticsLogLines(errorLogContent) }),
    t('diagnostics.metaWarnings', { count: countDiagnosticsLogLines(warnLogContent) }),
    t('diagnostics.metaPerformance', { count: countDiagnosticsLogLines(performanceLogContent) }),
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
    previewText: isLoading ? t('diagnostics.loading') : displayContent || emptyFilterText,
    warnLogContent,
  };
}
