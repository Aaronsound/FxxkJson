import React, { useMemo, useState } from 'react';
import type { Tab } from '../types/jsonTool';
import { compareJsonTexts, JsonDiffEntry, JsonDiffResult, JsonDiffType } from '../utils/jsonDiff';

interface JsonCompareDialogProps {
  tabs: Tab[];
  activeTabId: string;
  isDarkMode: boolean;
  getTabText: (tabId: string) => string;
  onClose: () => void;
}

const diffTypeLabel: Record<JsonDiffType, string> = {
  added: '新增',
  removed: '删除',
  changed: '修改',
};

function getDefaultRightTabId(tabs: Tab[], activeTabId: string) {
  return tabs.find((tab) => tab.id !== activeTabId)?.id ?? activeTabId;
}

function getSummary(diffs: JsonDiffEntry[]) {
  const added = diffs.filter((diff) => diff.type === 'added').length;
  const removed = diffs.filter((diff) => diff.type === 'removed').length;
  const changed = diffs.filter((diff) => diff.type === 'changed').length;
  return `新增 ${added} · 删除 ${removed} · 修改 ${changed}`;
}

const JsonCompareDialog: React.FC<JsonCompareDialogProps> = ({
  tabs,
  activeTabId,
  isDarkMode,
  getTabText,
  onClose,
}) => {
  const [leftTabId, setLeftTabId] = useState(activeTabId);
  const [rightTabId, setRightTabId] = useState(() => getDefaultRightTabId(tabs, activeTabId));
  const [result, setResult] = useState<JsonDiffResult | null>(null);

  const canCompare = tabs.length >= 2 && leftTabId !== rightTabId;
  const selectedLeftTitle = tabs.find((tab) => tab.id === leftTabId)?.title ?? '左侧';
  const selectedRightTitle = tabs.find((tab) => tab.id === rightTabId)?.title ?? '右侧';
  const summary = useMemo(() => (result ? getSummary(result.diffs) : '选择两个标签后开始对比'), [result]);

  const handleCompare = () => {
    setResult(compareJsonTexts(getTabText(leftTabId), getTabText(rightTabId)));
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="json-compare-title">
      <div className={isDarkMode ? 'modal-card modal-card-dark json-compare-card' : 'modal-card json-compare-card'}>
        <div className="modal-header">
          <h3 id="json-compare-title">JSON 对比</h3>
          <button type="button" className="about-dialog-close" onClick={onClose} aria-label="关闭对比">
            ×
          </button>
        </div>

        <div className="json-compare-selectors">
          <label>
            <span>左侧</span>
            <select value={leftTabId} onChange={(event) => setLeftTabId(event.target.value)}>
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>{tab.title}</option>
              ))}
            </select>
          </label>
          <label>
            <span>右侧</span>
            <select value={rightTabId} onChange={(event) => setRightTabId(event.target.value)}>
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>{tab.title}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleCompare} disabled={!canCompare}>
            开始对比
          </button>
        </div>

        {!canCompare && (
          <div className="modal-error">
            请选择两个不同的标签进行对比。
          </div>
        )}

        <div className="json-compare-summary">
          <span>{selectedLeftTitle}</span>
          <strong>{summary}</strong>
          <span>{selectedRightTitle}</span>
        </div>

        {(result?.leftError || result?.rightError) && (
          <div className="modal-error">
            {result.leftError && <div>左侧解析失败：{result.leftError}</div>}
            {result.rightError && <div>右侧解析失败：{result.rightError}</div>}
          </div>
        )}

        {result && !result.leftError && !result.rightError && result.diffs.length === 0 && (
          <div className="json-compare-empty">两个 JSON 内容一致。</div>
        )}

        {result && result.diffs.length > 0 && (
          <div className="json-compare-list" role="table" aria-label="JSON 差异列表">
            <div className="json-compare-list-header" role="row">
              <span>类型</span>
              <span>路径</span>
              <span>左侧值</span>
              <span>右侧值</span>
            </div>
            {result.diffs.map((diff, index) => (
              <div className="json-compare-row" role="row" key={`${diff.type}-${diff.pathText}-${index}`}>
                <span className={`json-compare-type json-compare-type-${diff.type}`}>
                  {diffTypeLabel[diff.type]}
                </span>
                <code>{diff.pathText}</code>
                <code>{diff.leftPreview}</code>
                <code>{diff.rightPreview}</code>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default JsonCompareDialog;
