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
  const leftModelRef = useRef<monaco.editor.ITextModel | null>(null);
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

    // src/App.tsx 中 onLeftMount(editor) 里
editor.onDidChangeModelContent(() => {
  const txt = editor.getValue();
  setLeftValue(txt);        // 同步 state
  formatInWorker(txt);      // 自动格式化到右侧
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
        // **全文粘贴**：销毁旧模型，换新模型，保证一次性插入所有行
        const oldModel = ed.getModel()!;
        const sel      = ed.getSelection()!;
        if (sel.equalsRange(oldModel.getFullModelRange())) {
          oldModel.dispose();
          const newModel = monaco.editor.createModel(text, 'json');
          ed.setModel(newModel);
          leftModelRef.current = newModel;
        } else {
          // **部分粘贴**：安全地在选区里替换
          ed.executeEdits('paste', [{
            range: sel,
            text,
            forceMoveMarkers: true
          }]);
        }
      });
    }
  });


    if (leftModelRef.current) {
      editor.setModel(leftModelRef.current);
    }
  };

  /** 右侧挂载：同步高亮 + 自定义右键菜单 “复制值” */
  const onRightMount: OnMount = (editor) => {
    rightEditor.current = editor;

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
  const handleImport = async () => {
    try {
      const filePath = await window.electronAPI?.selectJsonFile();
      if (!filePath) return;
      const content = await window.electronAPI!.readJsonFile(filePath);
      if (leftModelRef.current) {
        leftModelRef.current.dispose();
        leftTreeRef.current = undefined;
      }
      const rawModel = monaco.editor.createModel(content, 'json');
      leftModelRef.current = rawModel;
      leftEditor.current?.setModel(rawModel);
      leftTreeRef.current = parseTree(content);
      formatInWorker(content);
      setLeftValue(content);
      setSearchTerm('');
      setRightMatches([]);
      setRightDecs([]);
      setCurrentIdx(0);
    } catch (e: any) {
      setError('导入失败：' + e.message);
    }
  };

  /** 格式化 JSON → 更新 state */
  const formatInWorker = (text: string) => {
    setError(null);
    workerRef.current.onmessage = (e: MessageEvent) => {
      const { success, data, error: msg } = e.data;
      if (success) {
        setRightValue(data);
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
    formatInWorker(txt);
  };

  /** 清除 两侧 */
  const handleClear = () => {
    if (leftModelRef.current) {
      leftModelRef.current.dispose();
      leftTreeRef.current = undefined;
    }
    const emptyLeftModel = monaco.editor.createModel('', 'json');
    leftModelRef.current = emptyLeftModel;
    leftEditor.current?.setModel(emptyLeftModel);

    setRightValue('');
    setError(null);
    setSearchTerm('');
    setRightMatches([]);
    setRightDecs([]);
    setCurrentIdx(0);
    leftTreeRef.current = undefined;
    rightTreeRef.current = undefined;
    setLeftValue('');
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
      style={{ height: '100vh', width: '100vw' }}
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

      <Split
        sizes={[50, 50]}
        minSize={200}
        gutterSize={6}
        style={{ display: 'flex', height: 'calc(100% - 48px)' }}
      >
        {/* —— 左侧编辑器 —— */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          borderRight: isDarkMode ? '1px solid #444' : '1px solid #ddd'
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Editor
              onMount={onLeftMount}
              language="json"
              defaultValue=""
              theme={isDarkMode ? 'vs-dark' : 'vs-light'}
              options={{
                ...getMonacoOptions(),
              }}
              height="100%"
              loading={null}
              onChange={(value) => setLeftValue(value || '')}
            />
            {leftValue === '' && (
              <div className="editor-center-placeholder">
                原始 JSON
              </div>
            )}
          </div>
        </div>

        {/* —— 右侧编辑器 —— */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Editor
              onMount={onRightMount}
              language="json"
              value={rightValue}
              theme={isDarkMode ? 'vs-dark' : 'vs-light'}
              options={{
                ...getMonacoOptions(),
                readOnly: true,
              }}
              height="100%"
              loading={null}
            />
            {rightValue === '' && (
              <div className="editor-center-placeholder">格式化结果</div>
            )}
          </div>
        </div>
      </Split>

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
