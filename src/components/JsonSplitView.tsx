import React from 'react';
import Split from 'react-split';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { Tab } from '../types/app';

type JsonSplitViewProps = {
  tabs: Tab[];
  activeTabId: string;
  isDarkMode: boolean;
  rightValues: Record<string, string>;
  splitSizes: [number, number];
  onSplitDragEnd: (sizes: [number, number]) => void;
  getMonacoOptions: () => monaco.editor.IStandaloneEditorConstructionOptions;
  onLeftMount: OnMount;
  onRightMount: OnMount;
  onLeftValueChange: (tabId: string, value: string) => void;
};

/**
 * 左右编辑区：左侧编辑原始 JSON，右侧显示格式化结果。
 */
const JsonSplitView: React.FC<JsonSplitViewProps> = ({
  tabs,
  activeTabId,
  isDarkMode,
  rightValues,
  splitSizes,
  onSplitDragEnd,
  getMonacoOptions,
  onLeftMount,
  onRightMount,
  onLeftValueChange,
}) => {
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  if (!activeTab) {
    return null;
  }

  return (
    <Split
      sizes={splitSizes}
      minSize={200}
      gutterSize={6}
      onDragEnd={(sizes) => onSplitDragEnd([sizes[0], sizes[1]])}
      style={{
        display: 'flex',
        flex: 1,
        height: 'calc(100% - 48px)',
      }}
    >
      <div
        style={{
          position: 'relative',
          borderRight: isDarkMode ? '1px solid #444' : '1px solid #ddd',
          overflow: 'auto',
          minWidth: 0,
        }}
      >
        <Editor
          onMount={onLeftMount}
          language="json"
          theme={isDarkMode ? 'vs-dark' : 'vs-light'}
          options={getMonacoOptions()}
          path={activeTab.id}
          value={activeTab.content}
          saveViewState
          keepCurrentModel
          onChange={(value) => onLeftValueChange(activeTab.id, value || '')}
          height="100%"
          loading={null}
        />
        {activeTab.content === '' && <div className="editor-center-placeholder">原始 JSON</div>}
      </div>

      <div style={{ position: 'relative', overflow: 'auto', minWidth: 0 }}>
        <Editor
          onMount={onRightMount}
          language="json"
          path={`formatted-${activeTab.id}`}
          value={rightValues[activeTab.id] || ''}
          theme={isDarkMode ? 'vs-dark' : 'vs-light'}
          options={{ ...getMonacoOptions(), readOnly: true }}
          // 右侧折叠/滚动状态由 App 统一接管，避免与 wrapper 内置恢复互相覆盖。
          saveViewState={false}
          keepCurrentModel
          height="100%"
          loading={null}
        />
        {!rightValues[activeTab.id] && <div className="editor-center-placeholder">格式化结果</div>}
      </div>
    </Split>
  );
};

export default React.memo(JsonSplitView);
