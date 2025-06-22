// src/App.tsx
import React, { useRef, useState, useEffect } from 'react';
import Split from 'react-split';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import {
  parseTree,
  getLocation,
  findNodeAtLocation,
  Node as JsonNode
} from 'jsonc-parser';
import './App.css';

declare global {
  interface Window {
    electronAPI?: {
      selectJsonFile: () => Promise<string | null>;
      readJsonFile: (filePath: string) => Promise<string>;
    };
  }
}

const jsonWorker = new Worker(
  new URL('./workers/jsonParser.worker.js', import.meta.url),
  { type: 'module' }
);

const App: React.FC = () => {
  // —— 编辑器 & 模型 引用 —— 
  const leftEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const rightEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const workerRef = useRef<Worker>(jsonWorker);

  // —— JSON 树 引用 —— 
  const leftTreeRef = useRef<JsonNode | undefined>(undefined);
  const rightTreeRef = useRef<JsonNode | undefined>(undefined);

  // —— UI 状态 —— 
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [rightMatches, setRightMatches] = useState<monaco.editor.FindMatch[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [rightDecs, setRightDecs] = useState<string[]>([]);
  const [leftDecs, setLeftDecs] = useState<string[]>([]);

  // —— 深色模式 & 自动换行 & 左侧内容 & 右侧内容—— 
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [wrapLongLines, setWrapLongLines] = useState(false);
  const [leftValue, setLeftValue] = useState('');
  const [rightValue, setRightValue] = useState(''); // 格式化后文本

  // —— 新增：多标签页状态 —— 
  interface Tab {
    id: string;
    title: string;
    content: string;
  }
  const [tabs, setTabs] = useState<Tab[]>([{
    id: 'tab-1',
    title: 'HelloJson',
    content: ''
  }]);
  const [activeTabId, setActiveTabId] = useState('tab-1');

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    setTabs(ts => {
      setActiveTabId(id);
      return [...ts, { id, title: 'newTab', content: '' }];
    });
  };

  const closeTab = (id: string) => {
    setTabs(ts => ts.filter(t => t.id !== id));
    if (activeTabId === id && tabs.length > 1) {
      const idx = tabs.findIndex(t => t.id === id);
      const next = tabs[idx - 1 >= 0 ? idx - 1 : idx + 1];
      setActiveTabId(next.id);
    }
  };

  const updateTabContent = (id: string, content: string) => {
    setTabs(ts => ts.map(t => t.id === id ? { ...t, content } : t));
  };

  // 通用：给指定 Tab 重命名
  const renameTab = (id: string, newTitle: string) => {
    setTabs(ts =>
      ts.map(t =>
        t.id === id
          ? { ...t, title: newTitle }
          : t
      )
    );
  };


  // 1. 记录当前要重命名的 tab id 和输入值
  const [renamingTab, setRenamingTab] = useState<{
    id: string;
    value: string;
  } | null>(null);

  const startRenaming = (id: string, currentTitle: string) => {
    setRenamingTab({ id, value: currentTitle });
  };

  const finishRenaming = () => {
    if (renamingTab) {
      renameTab(renamingTab.id, renamingTab.value);
      setRenamingTab(null);
    }
  };




  // —— 自定义右键菜单 状态（保留复制值功能，如果已不需要可删除） —— 
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    toCopy: string;
  }>({
    visible: false,
    x: 0,
    y: 0,
    toCopy: ''
  });

  // —— 点击页面其他地方时，隐藏右键菜单 —— 
  useEffect(() => {
    const handleWindowClick = () => {
      setContextMenu(prev => (prev.visible ? { ...prev, visible: false } : prev));
    };
    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);


  // —— per‐tab 格式化结果存储 —— 
  const [rightValues, setRightValues] = useState<Record<string, string>>({
    'tab-1': ''
  });

  // —— Monaco 编辑器的公共配置 —— 
  const getMonacoOptions = (): monaco.editor.IStandaloneEditorConstructionOptions => ({
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    largeFileOptimizations: true,
    wordWrap: wrapLongLines ? 'on' : 'off',
    // ========= 启用折叠功能 =========
    folding: true,
    showFoldingControls: 'always',
    foldingStrategy: 'indentation',
    foldingHighlight: true,
    glyphMargin: true,
    // =================================
    occurrencesHighlight: 'off',
    renderWhitespace: 'none',
    matchBrackets: 'never',
    fontLigatures: false,
    codeLens: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 3,
    maxTokenizationLineLength: 1000000,
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false,
    },
    // 关闭缩进辅助线（新 API）
    guides: {
      indentation: false
    }
  });

  /** 左侧挂载 */
  const onLeftMount: OnMount = (editor) => {


    leftEditor.current = editor;

    // 当 editor 被 dispose 时，清空引用
    editor.onDidDispose(() => {
      if (leftEditor.current === editor) {
        leftEditor.current = null;
      }
    });

    // —— 覆盖 Delete 命令 —— //
    editor.addCommand(monaco.KeyCode.Delete, () => {
      const model = editor.getModel()!;
      const sel = editor.getSelection()!;

      // 如果选区覆盖了整个文本，就走清空逻辑
      if (sel.equalsRange(model.getFullModelRange())) {
        handleClear();
      } else {
        // 否则执行 Monaco 默认的“删除右侧”命令
        editor.trigger('', 'deleteRight', null);
      }
    });

    // 覆盖 Backspace
    editor.addCommand(monaco.KeyCode.Backspace, () => {
      const model = editor.getModel()!;
      const sel = editor.getSelection()!;
      if (sel.equalsRange(model.getFullModelRange())) {
        handleClear();
      } else {
        editor.trigger('', 'deleteLeft', null);
      }
    });

    editor.onDidChangeModelContent(() => {
      const txt = editor.getValue();
      // 直接用当前激活的 activeTabId
      updateTabContent(activeTabId, txt);
      formatInWorker(txt, activeTabId);
    });



    // —— 拦截“粘贴”命令（键盘 + 右键菜单） —— //
    editor.addAction({
      id: 'custom.clipboardPasteAction',
      label: 'Custom Paste',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 1,
      run: (ed) => {
        navigator.clipboard.readText().then((text) => {
          const model = ed.getModel()!;
          const sel = ed.getSelection()!;
          if (sel.equalsRange(model.getFullModelRange())) {
            // **全文粘贴**：直接替换编辑器内容
            ed.setValue(text);
            // 同步到 tabs[].content
            updateTabContent(activeTabId, text);
            // 触发格式化
            formatInWorker(text, activeTabId);
          } else {
            // **部分粘贴**：按选区插入
            ed.executeEdits('paste', [{
              range: sel,
              text,
              forceMoveMarkers: true
            }]);
          }
        });
      }
    });


  };

  /** 右侧挂载：同步高亮 + 自定义右键菜单 “复制值” */
  const onRightMount: OnMount = (editor) => {
    rightEditor.current = editor;

    // 当 editor 被 dispose 时，清空引用
    editor.onDidDispose(() => {
      if (rightEditor.current === editor) {
        rightEditor.current = null;
      }
    });

    // —— (1) 光标同步左右侧高亮 逻辑不变 —— 
    editor.onDidChangeCursorPosition((e) => {
      if (e.position.lineNumber === 1 && e.position.column === 1) return;
      const model = editor.getModel();
      if (!model) return;
      const offset = model.getOffsetAt(e.position);
      const formattedText = model.getValue();
      const loc = getLocation(formattedText, offset);
      const path = loc.path;
      if (!rightTreeRef.current) return;
      const rightNode = findNodeAtLocation(rightTreeRef.current, path);
      if (!rightNode) return;
      if (!leftTreeRef.current) return;
      const leftNode = findNodeAtLocation(leftTreeRef.current, path);
      if (!leftNode) return;
      const rawModel = leftEditor.current?.getModel();
      if (!rawModel) return;
      const startPos = rawModel.getPositionAt(leftNode.offset);
      const endPos = rawModel.getPositionAt(leftNode.offset + leftNode.length);
      leftEditor.current?.revealRangeInCenter(
        new monaco.Range(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber, endPos.column
        )
      );
      leftEditor.current?.setSelection(
        new monaco.Selection(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber, endPos.column
        )
      );
      const decs = [{
        range: new monaco.Range(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber, endPos.column
        ),
        options: { inlineClassName: 'currentSearchHighlight' }
      }];
      const newIds = leftEditor.current!.deltaDecorations(leftDecs, decs);
      setLeftDecs(newIds);
      setTimeout(() => {
        leftEditor.current?.deltaDecorations(newIds, []);
        setLeftDecs([]);
      }, 1500);
    });

    // —— (2) 在 Monaco 自带右键菜单里挂 “复制值” (如需复制值功能) —— 
    editor.addAction({
      id: 'copyValueAction',
      label: '复制值',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: (ed) => {
        const model = ed.getModel();
        const pos = ed.getPosition();
        if (!model || !pos) return;
        const offset = model.getOffsetAt(pos);
        const formattedText = model.getValue();
        const loc = getLocation(formattedText, offset);
        const path = loc.path;
        if (!rightTreeRef.current) return;
        const node = findNodeAtLocation(rightTreeRef.current, path);
        if (!node) return;
        let toCopy = '';
        if (node.type === 'string') {
          toCopy = node.value as string;
        } else {
          toCopy = formattedText.slice(node.offset, node.offset + node.length);
        }
        navigator.clipboard.writeText(toCopy).catch(console.error);
      }
    });
  };






  /** 导入 JSON */
  // —— 导入 JSON，不再 dispose 或新建 model —— 
  const handleImport = async () => {
    try {
      const filePath = await window.electronAPI!.selectJsonFile();
      if (!filePath) return;
      const content = await window.electronAPI!.readJsonFile(filePath);

      // 更新标签名称
      const fileName = filePath.split(/[\\/]/).pop() || 'Untitled';
      renameTab(activeTabId, fileName);

      // 只更新 tabs[].content，不要再操作 model
      updateTabContent(activeTabId, content);

      // 更新 AST 并触发格式化
      leftTreeRef.current = parseTree(content);
      formatInWorker(content, activeTabId);

      // 重置搜索/高亮状态
      setSearchTerm('');
      setRightMatches([]);
      setRightDecs([]);
      setCurrentIdx(0);

    } catch (e: any) {
      setError('导入失败：' + e.message);
    }
  };




  /** 格式化 JSON → 更新 state */
  const formatInWorker = (text: string, tabId: string) => {
    setError(null);
    // —— 如果是空内容，就不走 Worker 了，直接清空右侧
  if (!text) {
    setRightValues(rv => ({ ...rv, [tabId]: '' }));
    return;
  }
    workerRef.current.onmessage = (e: MessageEvent) => {
      const { success, data, error: msg } = e.data;
      if (success) {
        setRightValues(rv => ({ ...rv, [tabId]: data }));
        rightTreeRef.current = parseTree(data);
      } else {
        setError(msg);
      }
    };
    workerRef.current.postMessage(text);
  };


  /** 点击格式化 （先更新左侧 AST，再格式化右侧） */
  const handleFormat = () => {
    const txt = leftEditor.current?.getValue() || '';
    if (txt !== '') {
      leftTreeRef.current = parseTree(txt);
    } else {
      leftTreeRef.current = undefined;
    }
    formatInWorker(txt, activeTabId);
  };

  /** 清除 两侧 */
  // —— 清除内容，也不 dispose model —— 
  const handleClear = () => {
    // 1. 只更新 tabs[].content，不再操作 model
    updateTabContent(activeTabId, '');

      // 2. 重置标签标题为默认
+  renameTab(activeTabId, 'newTab');

    // 3. 清空 AST 和格式化结果
    leftTreeRef.current = undefined;
    rightTreeRef.current = undefined;
    setRightValues(rv => ({ ...rv, [activeTabId]: '' }));

    // 4. 重置搜索/高亮/报错等状态
    setError(null);
    setSearchTerm('');
    setRightMatches([]);
    setRightDecs([]);
    setCurrentIdx(0);
  };





  /** 折叠全部 */
  const handleFoldAll = () => {
    if (!rightEditor.current) return;
    const action = rightEditor.current.getAction('editor.foldAll');
    if (action) {
      action.run();
    }
  };

  /** 展开全部 */
  const handleUnfoldAll = () => {
    if (!rightEditor.current) return;
    const action = rightEditor.current.getAction('editor.unfoldAll');
    if (action) {
      action.run();
    }
  };

  /** 右侧搜索 & 左侧高亮 */
  const runRightSearch = (term: string) => {
    const ed = rightEditor.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;
    const allMatches = term
      ? model.findMatches(term, true, true, false, null, true)
      : [];
    setRightMatches(allMatches);
    const decs = allMatches.map((m, i) => ({
      range: m.range,
      options: {
        inlineClassName:
          i === currentIdx ? 'currentSearchHighlight' : 'searchHighlight'
      }
    }));
    const ids = ed.deltaDecorations(rightDecs, decs);
    setRightDecs(ids);
    if (allMatches.length > 0) {
      const match = allMatches[currentIdx % allMatches.length];
      ed.revealRangeInCenter(match.range);
      const snippetText = model.getValueInRange(match.range);
      const leftEd = leftEditor.current;
      if (!leftEd) return;
      const lm = leftEd.getModel();
      if (!lm) return;
      const leftMatch = lm.findNextMatch(
        snippetText,
        new monaco.Position(1, 1),
        false,
        false,
        null,
        false
      );
      if (leftMatch) {
        leftEd.revealRangeInCenter(leftMatch.range);
        const s = leftMatch.range.getStartPosition();
        const e = leftMatch.range.getEndPosition();
        leftEd.setSelection(
          new monaco.Selection(
            s.lineNumber, s.column,
            e.lineNumber, e.column
          )
        );
        const dec2 = [{
          range: leftMatch.range,
          options: { inlineClassName: 'currentSearchHighlight' }
        }];
        const newIds2 = leftEd.deltaDecorations(leftDecs, dec2);
        setLeftDecs(newIds2);
        setTimeout(() => {
          leftEd.deltaDecorations(newIds2, []);
          setLeftDecs([]);
        }, 1500);
      }
    }
  };

  const gotoNext = () => {
    if (!rightMatches.length) return;
    setCurrentIdx(i => (i + 1) % rightMatches.length);
  };
  const gotoPrev = () => {
    if (!rightMatches.length) return;
    setCurrentIdx(i => (i - 1 + rightMatches.length) % rightMatches.length);
  };

  useEffect(() => {
    runRightSearch(searchTerm);
  }, [searchTerm, currentIdx]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  return (
    <div
      className={isDarkMode ? 'app-container dark-mode' : 'app-container'}
      style={{ 
        height: '100vh', 
        width: '100vw',
              /* 禁止整个页面滚动 */
      overflow: 'hidden',
           display: 'flex',           // 新增：Flex 容器
    flexDirection: 'column'    // 新增：纵向排列
}}
    >
      {/* —— 统一顶部菜单栏 —— */}
      <div className="toolbar">
        <div className="toolbar-group">
          <button onClick={handleImport}>导入 JSON</button>
          <button onClick={handleFormat}>格式化</button>
          <button onClick={handleClear}>清除</button>
          <button onClick={handleFoldAll}>折叠全部</button>
          <button onClick={handleUnfoldAll}>展开全部</button>
        </div>

        <div className="toolbar-group toolbar-search">
          <input
            className="toolbar-input"
            placeholder="搜索格式化结果…"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentIdx(0);
            }}
          />
          <button onClick={gotoPrev} disabled={!rightMatches.length}>上一处</button>
          <button onClick={gotoNext} disabled={!rightMatches.length}>下一处</button>
        </div>

        <div className="toolbar-group toolbar-options">
          <label className="toolbar-checkbox">
            <input
              type="checkbox"
              checked={wrapLongLines}
              onChange={e => setWrapLongLines(e.target.checked)}
            />
            自动换行
          </label>
          <button onClick={toggleDarkMode} className="toolbar-toggle">
            {isDarkMode ? '切回浅色' : '切换深色'}
          </button>
        </div>

        <div className="toolbar-more">
          <select
            onChange={e => {
              if (e.target.value === 'wrap') {
                setWrapLongLines(prev => !prev);
              } else if (e.target.value === 'theme') {
                setIsDarkMode(prev => !prev);
              }
              e.target.value = '';
            }}
          >
            <option value="" hidden>更多</option>
            <option value="wrap">{wrapLongLines ? '关闭自动换行' : '开启自动换行'}</option>
            <option value="theme">{isDarkMode ? '切回浅色' : '切换深色'}</option>
          </select>
        </div>

        {error && <span className="toolbar-error">{error}</span>}
      </div>

      {/* —— 多标签页栏 —— */}
      <div className="tab-bar">
        {tabs.map(tab => {
          const isRenaming = renamingTab?.id === tab.id;
          return (
            <div
              key={tab.id}
              className={tab.id === activeTabId ? 'tab active' : 'tab'}
              onClick={() => setActiveTabId(tab.id)}
              // 双击或右键都触发 startRenaming
              onDoubleClick={() => startRenaming(tab.id, tab.title)}
              onContextMenu={e => { e.preventDefault(); startRenaming(tab.id, tab.title); }}
            >
              {isRenaming ? (
                // 2. 正在重命名，显示 <input>
                <input
                  autoFocus
                  value={renamingTab.value}
                  onChange={e => setRenamingTab({ ...renamingTab, value: e.target.value })}
                  onBlur={finishRenaming}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      finishRenaming();
                    } else if (e.key === 'Escape') {
                      setRenamingTab(null);
                    }
                  }}
                  style={{
                    width: '80px',
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                // 3. 正常模式，显示 title
                <>
                  {tab.title}
                  <span
                    onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                  >
                    ×
                  </span>
                </>
              )}
            </div>
          );
        })}
        <button className="add-tab" onClick={addTab}>＋</button>
      </div>


      {/* —— 根据 activeTabId 渲染当前标签面板 —— */}
      {tabs.map(tab =>
        tab.id === activeTabId && (
          <Split
            key={tab.id}
            sizes={[50, 50]}
            minSize={200}
            gutterSize={6}
            style={{
              display: 'flex',
              flex: 1,        // 填满父容器剩余空间
              height: 'calc(100% - 48px)'
            }}
          >
            {/* —— 左侧编辑器，绑定到 tab.content —— */}
            <div style={{
              flex: 1,
              position: 'relative',
              borderRight: isDarkMode ? '1px solid #444' : '1px solid #ddd',
              /* Monaco 自身滚动生效 */
              overflow: 'auto'
            }}>
              <Editor
                key={tab.id}
                onMount={onLeftMount}
                language="json"
                theme={isDarkMode ? 'vs-dark' : 'vs-light'}
                options={getMonacoOptions()}
                path={tab.id}                                   // 唯一标识
                value={tab.content}
                onChange={v => {
                  const txt = v || '';
                  updateTabContent(tab.id, txt);                // 同步到 tabs[].content
                  formatInWorker(txt, tab.id);                  // 触发右侧格式化
                }}
                height="100%"
                loading={null}
              />
              {tab.content === '' && (
                <div className="editor-center-placeholder">原始 JSON</div>
              )}
            </div>

            {/* —— 右侧编辑器，使用 per-tab 格式化结果 —— */}
            <div style={{
              flex: 1,
              position: 'relative',
              /* Monaco 自身滚动生效 */
              overflow: 'auto'
            }}>
              <Editor
                onMount={onRightMount}
                language="json"
                value={rightValues[tab.id] || ''}
                theme={isDarkMode ? 'vs-dark' : 'vs-light'}
                options={{ ...getMonacoOptions(), readOnly: true }}
                height="100%"
                loading={null}
              />
              {!rightValues[tab.id] && (
                <div className="editor-center-placeholder">格式化结果</div>
              )}
            </div>
          </Split>
        )
      )}





      {/* —— 自定义 “复制值” 右键菜单 —— */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#fff',
            border: '1px solid #ccc',
            zIndex: 10000,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
          }}
        >
          <div
            style={{ padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.toCopy).catch(console.error);
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            复制值
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
