import React, { useMemo, useState } from 'react';
import type { Tab } from '../types/jsonTool';
import { compareJsonTexts, JsonDiffEntry, JsonDiffResult, JsonDiffType } from '../utils/jsonDiff';
import { createTranslator, type I18nKey } from '../utils/i18n';

interface JsonCompareDialogProps {
  tabs: Tab[];
  activeTabId: string;
  isDarkMode: boolean;
  getTabText: (tabId: string) => string;
  onClose: () => void;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

type Translator = (key: I18nKey, params?: Record<string, string | number>) => string;
const defaultT = createTranslator('zh');

const diffTypeLabelKey: Record<JsonDiffType, I18nKey> = {
  added: 'compare.added',
  removed: 'compare.removed',
  changed: 'compare.changed',
};

function getDefaultRightTabId(tabs: Tab[], activeTabId: string) {
  return tabs.find((tab) => tab.id !== activeTabId)?.id ?? activeTabId;
}

function getSummary(diffs: JsonDiffEntry[], t: Translator) {
  const added = diffs.filter((diff) => diff.type === 'added').length;
  const removed = diffs.filter((diff) => diff.type === 'removed').length;
  const changed = diffs.filter((diff) => diff.type === 'changed').length;
  return t('compare.summary', { added, removed, changed });
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
  const [result, setResult] = useState<JsonDiffResult | null>(null);

  const canCompare = tabs.length >= 2 && leftTabId !== rightTabId;
  const selectedLeftTitle = tabs.find((tab) => tab.id === leftTabId)?.title ?? t('compare.left');
  const selectedRightTitle = tabs.find((tab) => tab.id === rightTabId)?.title ?? t('compare.right');
  const summary = useMemo(() => (result ? getSummary(result.diffs, t) : t('compare.emptySummary')), [result, t]);

  const handleCompare = () => {
    setResult(compareJsonTexts(getTabText(leftTabId), getTabText(rightTabId)));
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="json-compare-title">
      <div className={isDarkMode ? 'modal-card modal-card-dark json-compare-card' : 'modal-card json-compare-card'}>
        <div className="modal-header">
          <h3 id="json-compare-title">{t('compare.title')}</h3>
          <button type="button" className="about-dialog-close" onClick={onClose} aria-label={t('compare.closeLabel')}>
            ×
          </button>
        </div>

        <div className="json-compare-selectors">
          <label>
            <span>{t('compare.left')}</span>
            <select value={leftTabId} onChange={(event) => setLeftTabId(event.target.value)}>
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('compare.right')}</span>
            <select value={rightTabId} onChange={(event) => setRightTabId(event.target.value)}>
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleCompare} disabled={!canCompare}>
            {t('compare.start')}
          </button>
        </div>

        {!canCompare && <div className="modal-error">{t('compare.needTwoTabs')}</div>}

        <div className="json-compare-summary">
          <span>{selectedLeftTitle}</span>
          <strong>{summary}</strong>
          <span>{selectedRightTitle}</span>
        </div>

        {(result?.leftError || result?.rightError) && (
          <div className="modal-error">
            {result.leftError && <div>{t('compare.leftParseFailed', { error: result.leftError })}</div>}
            {result.rightError && <div>{t('compare.rightParseFailed', { error: result.rightError })}</div>}
          </div>
        )}

        {result && !result.leftError && !result.rightError && result.diffs.length === 0 && (
          <div className="json-compare-empty">{t('compare.same')}</div>
        )}

        {result && result.diffs.length > 0 && (
          <div className="json-compare-list" role="table" aria-label={t('compare.listLabel')}>
            <div className="json-compare-list-header" role="row">
              <span>{t('compare.type')}</span>
              <span>{t('compare.path')}</span>
              <span>{t('compare.leftValue')}</span>
              <span>{t('compare.rightValue')}</span>
            </div>
            {result.diffs.map((diff, index) => (
              <div className="json-compare-row" role="row" key={`${diff.type}-${diff.pathText}-${index}`}>
                <span className={`json-compare-type json-compare-type-${diff.type}`}>
                  {t(diffTypeLabelKey[diff.type])}
                </span>
                <code>{diff.pathText}</code>
                <code>{diff.leftPreview}</code>
                <code>{diff.rightPreview}</code>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t('compare.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JsonCompareDialog;
