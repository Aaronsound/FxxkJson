import type React from 'react';
import { useRef, useState } from 'react';
import { useModalFocusManagement } from '../hooks/useModalFocusManagement';
import type { Tab } from '../types/jsonTool';
import { MAX_DIFFS, type JsonDiffEntry } from '../utils/jsonDiff';
import { useJsonComparison } from '../hooks/useJsonComparison';
import { createTranslator, type I18nKey } from '../utils/i18n';
import { JsonCompareDetails } from './JsonCompareDetails';
import { JsonCompareList } from './JsonCompareList';

interface JsonCompareDialogProps {
  tabs: Tab[];
  activeTabId: string;
  isDarkMode: boolean;
  getTabText: (tabId: string) => string;
  onClose: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');
const EMPTY_DIFFS: JsonDiffEntry[] = [];

function getDefaultRightTabId(tabs: Tab[], activeTabId: string) {
  return tabs.find((tab) => tab.id !== activeTabId)?.id ?? activeTabId;
}

const JsonCompareDialog: React.FC<JsonCompareDialogProps> = ({
  tabs,
  activeTabId,
  isDarkMode,
  getTabText,
  onClose,
  t = defaultT,
}) => {
  const [leftTabId, setLeftTabId] = useState(activeTabId);
  const [rightTabId, setRightTabId] = useState(() => getDefaultRightTabId(tabs, activeTabId));
  const [page, setPage] = useState(0);
  const { result, isComparing, error, compare, reset, loadMore, getValue, getPage, releaseValues } =
    useJsonComparison();
  const [selectedDiff, setSelectedDiff] = useState<JsonDiffEntry | null>(null);
  const lastLoadedPage = Math.max(0, (result?.pageCount ?? 0) - 1);
  const visiblePage = Math.min(page, lastLoadedPage);
  const visibleDiffs = getPage(visiblePage) ?? EMPTY_DIFFS;
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusManagement(dialogRef, onClose);

  const canCompare = tabs.length >= 2 && leftTabId !== rightTabId;
  const selectedLeftTitle = tabs.find((tab) => tab.id === leftTabId)?.title ?? t('compare.left');
  const selectedRightTitle = tabs.find((tab) => tab.id === rightTabId)?.title ?? t('compare.right');
  const summary = result ? t('compare.summary', result.counts) : t('compare.emptySummary');

  const handleCompare = () => {
    setSelectedDiff(null);
    setPage(0);
    if (canCompare) compare(getTabText(leftTabId), getTabText(rightTabId));
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    if (nextPage > lastLoadedPage) loadMore();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="json-compare-title">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={isDarkMode ? 'modal-card modal-card-dark json-compare-card' : 'modal-card json-compare-card'}
      >
        <div className="modal-header">
          <h3 id="json-compare-title">{t('compare.title')}</h3>
          <button type="button" className="about-dialog-close" onClick={onClose} aria-label={t('compare.closeLabel')}>
            ×
          </button>
        </div>

        <div className="json-compare-selectors">
          <label>
            <span>{t('compare.left')}</span>
            <select
              value={leftTabId}
              onChange={(event) => {
                reset();
                setSelectedDiff(null);
                setPage(0);
                setLeftTabId(event.target.value);
              }}
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('compare.right')}</span>
            <select
              value={rightTabId}
              onChange={(event) => {
                reset();
                setSelectedDiff(null);
                setPage(0);
                setRightTabId(event.target.value);
              }}
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleCompare} disabled={!canCompare || isComparing}>
            {isComparing ? t('compare.running') : t('compare.start')}
          </button>
        </div>

        {!canCompare && <div className="modal-error">{t('compare.needTwoTabs')}</div>}
        {error && (
          <div className="modal-error" role="alert">
            {t('compare.failed', { error })}
          </div>
        )}
        {isComparing && <div role="status">{t('compare.running')}</div>}

        <div className="json-compare-summary">
          <span>{selectedLeftTitle}</span>
          <strong>{summary}</strong>
          <span>{selectedRightTitle}</span>
        </div>

        {result && !result.leftError && !result.rightError && result.total > 0 && (
          <div role="status">
            {t(result.truncated ? 'compare.truncated' : 'compare.complete', { count: result.total })}
          </div>
        )}

        {(result?.leftError || result?.rightError) && (
          <div className="modal-error">
            {result.leftError && <div>{t('compare.leftParseFailed', { error: result.leftError })}</div>}
            {result.rightError && <div>{t('compare.rightParseFailed', { error: result.rightError })}</div>}
          </div>
        )}

        {result && !result.leftError && !result.rightError && result.total === 0 && (
          <div className="json-compare-empty">{t('compare.same')}</div>
        )}

        {selectedDiff && (
          <JsonCompareDetails
            key={selectedDiff.pathText}
            diff={selectedDiff}
            getValue={getValue}
            t={t}
            onClose={() => {
              setSelectedDiff(null);
              releaseValues();
            }}
          />
        )}
        {result && result.total > 0 && (
          <JsonCompareList
            key={visiblePage}
            diffs={visibleDiffs}
            hidden={!!selectedDiff}
            startIndex={visiblePage * MAX_DIFFS}
            onSelect={setSelectedDiff}
            t={t}
          />
        )}

        <div className="modal-actions">
          {!selectedDiff && result && result.total > 0 && (
            <>
              <span>
                {t('compare.range', {
                  start: visiblePage * MAX_DIFFS + 1,
                  end: visiblePage * MAX_DIFFS + visibleDiffs.length,
                })}
              </span>
              <button
                type="button"
                onClick={() => changePage(visiblePage - 1)}
                disabled={visiblePage === 0 || isComparing}
              >
                {t('compare.previous')}
              </button>
              <button
                type="button"
                onClick={() => changePage(visiblePage + 1)}
                disabled={isComparing || (visiblePage === lastLoadedPage && (!result.truncated || !!error))}
              >
                {visiblePage < lastLoadedPage ? t('compare.next') : t('compare.loadMore')}
              </button>
            </>
          )}
          <button type="button" onClick={onClose}>
            {t('compare.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JsonCompareDialog;
