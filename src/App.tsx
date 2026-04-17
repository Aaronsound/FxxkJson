import React, { useEffect, useRef, useState } from 'react';
import Split from 'react-split';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import JsonEditModal from './components/JsonEditModal';
import JsonPerformancePanel from './components/JsonPerformancePanel';
import JsonToolTabBar from './components/JsonToolTabBar';
import JsonToolToolbar from './components/JsonToolToolbar';
import { useJsonFormattingWorker } from './hooks/useJsonFormattingWorker';
import { useJsonPerformanceTracking } from './hooks/useJsonPerformanceTracking';
import { useJsonToolTabsState } from './hooks/useJsonToolTabsState';
import {
  DEFAULT_TAB_TITLE,
  EMPTY_DOCUMENT_META,
  INITIAL_TAB_ID,
  LARGE_FILE_THRESHOLD,
  SEARCH_HIGHLIGHT_DURATION,
  StructureStatus,
  STRUCTURE_SYNC_THRESHOLD,
} from './types/jsonTool';
import {
  canUseStructureSync,
  createTab,
  forceEnableModelTokenization,
  getEditorLanguageByLength,
  getLeftModelPath,
  getOrCreateModel,
  getRightModelPath,
  getUtf8ByteLength,
  isLargeDocument,
  recreateModel,
  selectionCoversModel,
} from './utils/jsonToolModels';
import './App.css';

const PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY = 'hanjson.performancePanel.visible.v2';

function formatBytes(value: number) {
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 100 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDuration(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return null;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

const App: React.FC = () => {
  const {
    activeTabId,
    cancelRenaming,
    documentMetaByTab,
    errorsByTab,
    finishRenaming,
    handleRenamingChange,
    importingByTab,
    initializeTabState,
    isFormattingByTab,
    largeFileLocateEnabledByTab,
    largeModeByTab,
    removeTabState,
    renameTab,
    renamingTab,
    setActiveTabId,
    setDocumentMeta,
    setTabError,
    setTabFormatting,
    setTabImporting,
    setTabLargeModeState,
    setLargeFileLocateEnabledState,
    setStructureStatusState,
    setTabs,
    startRenamingTab,
    structureStatusByTab,
    tabs,
  } = useJsonToolTabsState({
    initialTabId: INITIAL_TAB_ID,
    initialTabTitle: 'HelloJson',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [rightMatches, setRightMatches] = useState<monaco.editor.FindMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [wrapLongLines, setWrapLongLines] = useState(false);
  const [showPerformancePanel, setShowPerformancePanel] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.localStorage.getItem(PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY) !== 'false';
  });
  const [editJsonSession, setEditJsonSession] = useState<{ key: number; initialValue: string } | null>(null);
  const [editJsonError, setEditJsonError] = useState<string | null>(null);
  const [hasCopiedLiteral, setHasCopiedLiteral] = useState(false);

  const leftEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const rightEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rawTextByTabRef = useRef<Record<string, string>>({
    [INITIAL_TAB_ID]: '',
  });
  const formattedTextByTabRef = useRef<Record<string, string>>({
    [INITIAL_TAB_ID]: '',
  });
  const suppressLeftChangeRef = useRef<Record<string, boolean>>({});
  const activeTabIdRef = useRef(INITIAL_TAB_ID);
  const largeModeRef = useRef<Record<string, boolean>>({
    [INITIAL_TAB_ID]: false,
  });
  const largeFileLocateEnabledRef = useRef<Record<string, boolean>>({
    [INITIAL_TAB_ID]: false,
  });
  const structureStatusRef = useRef<Record<string, StructureStatus>>({
    [INITIAL_TAB_ID]: 'ready',
  });
  const workerStructureEnabledRef = useRef<Record<string, boolean>>({
    [INITIAL_TAB_ID]: false,
  });
  const leftDecorationIdsRef = useRef<string[]>([]);
  const rightDecorationIdsRef = useRef<string[]>([]);
  const highlightTimeoutRef = useRef<number | null>(null);
  const editJsonValueRef = useRef('');
  const copyLiteralTimeoutRef = useRef<number | null>(null);
  const leftViewStateByTabRef = useRef<Record<string, monaco.editor.ICodeEditorViewState | null>>({});
  const rightViewStateByTabRef = useRef<Record<string, monaco.editor.ICodeEditorViewState | null>>({});
  const previousActiveTabIdRef = useRef(INITIAL_TAB_ID);
  const {
    beginPerformanceSession,
    clearPerformanceState,
    logEvent,
    mutatePerformanceSession,
    performanceByTab,
    performanceSessionsRef,
    setPerformanceByTab,
    syncPerformanceSnapshot,
  } = useJsonPerformanceTracking({
    activeTabIdRef,
    initialTabId: INITIAL_TAB_ID,
  });

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const activeDocumentMeta = activeTab
    ? documentMetaByTab[activeTab.id] ?? EMPTY_DOCUMENT_META
    : EMPTY_DOCUMENT_META;
  const activeRawText = activeTab
    ? rawTextByTabRef.current[activeTab.id] ?? ''
    : '';
  const currentError = activeTab ? errorsByTab[activeTab.id] ?? null : null;
  const importingFileName = activeTab
    ? importingByTab[activeTab.id] ?? null
    : null;
  const isImportingActiveTab = Boolean(importingFileName);
  const formattedValue = activeTab ? formattedTextByTabRef.current[activeTab.id] ?? '' : '';
  const isFormattingActiveTab = activeTab
    ? Boolean(isFormattingByTab[activeTab.id])
    : false;
  const isLargeFileMode = activeTab
    ? Boolean(
      largeModeByTab[activeTab.id]
      || activeDocumentMeta.rawLength >= LARGE_FILE_THRESHOLD
      || activeDocumentMeta.formattedLength >= LARGE_FILE_THRESHOLD
    )
    : false;
  const currentStructureStatus = activeTab
    ? structureStatusByTab[activeTab.id] ?? 'ready'
    : 'ready';
  const isLargeFileLocateEnabled = activeTab
    ? Boolean(largeFileLocateEnabledByTab[activeTab.id])
    : false;
  const canEnableLargeFileLocate = activeTab
    ? canUseStructureSync(activeRawText)
    : false;
  const canEditJson = Boolean(activeRawText.trim());
  const canUseRightPaneFolding = activeTab
    ? activeDocumentMeta.rawLength > 0 && activeDocumentMeta.rawLength <= STRUCTURE_SYNC_THRESHOLD
    : false;
  const shouldEnableRightPaneFolding = activeTab
    ? activeDocumentMeta.rawLength <= STRUCTURE_SYNC_THRESHOLD
    : true;
  const activePerformanceSnapshot = activeTab
    ? performanceByTab[activeTab.id] ?? null
    : null;
  const leftPaneMetaText = [
    activeDocumentMeta.rawLength > 0 ? `内存 ${formatBytes(activeDocumentMeta.rawLength)}` : null,
    formatDuration(activePerformanceSnapshot?.readFileMs)
      ? `导入 ${formatDuration(activePerformanceSnapshot?.readFileMs)}`
      : null,
  ].filter(Boolean).join(' · ');
  const rightPaneStatusText = (() => {
    if (!isLargeFileMode) {
      return canUseRightPaneFolding ? '支持折叠' : null;
    }

    if (!canEnableLargeFileLocate) {
      return '定位已关闭';
    }

    if (!isLargeFileLocateEnabled) {
      return '定位未启用';
    }

    if (currentStructureStatus === 'building') {
      return '定位索引中';
    }

    if (currentStructureStatus === 'ready') {
      return '定位已启用';
    }

    return '定位已关闭';
  })();
  const rightPaneMetaText = [
    activeDocumentMeta.formattedLength > 0 ? `内存 ${formatBytes(activeDocumentMeta.formattedLength)}` : null,
    formatDuration(activePerformanceSnapshot?.formatWorkerMs)
      ? `格式化 ${formatDuration(activePerformanceSnapshot?.formatWorkerMs)}`
      : null,
    rightPaneStatusText,
  ].filter(Boolean).join(' · ');

  const clearLeftHighlights = () => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    if (leftEditorRef.current && leftDecorationIdsRef.current.length > 0) {
      leftEditorRef.current.deltaDecorations(leftDecorationIdsRef.current, []);
      leftDecorationIdsRef.current = [];
    }
  };

  const clearRightHighlights = () => {
    if (rightEditorRef.current && rightDecorationIdsRef.current.length > 0) {
      rightEditorRef.current.deltaDecorations(rightDecorationIdsRef.current, []);
      rightDecorationIdsRef.current = [];
    }
  };

  const clearCopyLiteralNotice = () => {
    if (copyLiteralTimeoutRef.current !== null) {
      window.clearTimeout(copyLiteralTimeoutRef.current);
      copyLiteralTimeoutRef.current = null;
    }
    setHasCopiedLiteral(false);
  };

  const logRightEditorState = (
    event: string,
    tabId: string,
    extra: Record<string, unknown> = {}
  ) => {
    const editor = rightEditorRef.current;
    const model = editor?.getModel();
    const rawText = rawTextByTabRef.current[tabId] ?? '';
    const formattedText = formattedTextByTabRef.current[tabId] ?? '';
    const payload = {
      tabId,
      rawBytes: getUtf8ByteLength(rawText),
      formattedBytes: getUtf8ByteLength(formattedText),
      isActiveTab: activeTabIdRef.current === tabId,
      modelLanguageId: model?.getLanguageId() ?? null,
      modelLineCount: model?.getLineCount() ?? 0,
      modelValueLength: model?.getValueLength() ?? 0,
      largeMode: Boolean(largeModeRef.current[tabId]),
      locateEnabled: Boolean(largeFileLocateEnabledRef.current[tabId]),
      structureStatus: structureStatusRef.current[tabId] ?? null,
      withinStructureThreshold: getUtf8ByteLength(rawText) <= STRUCTURE_SYNC_THRESHOLD,
      ...extra,
    };

    console.info(`[HanJson][${event}]`, payload);
    logEvent(event, payload);
  };

  const resetSearchState = () => {
    setSearchTerm('');
    setRightMatches([]);
    setCurrentMatchIndex(0);
    clearLeftHighlights();
    clearRightHighlights();
  };

  const setTabLargeMode = (tabId: string, enabled: boolean) => {
    largeModeRef.current[tabId] = enabled;
    setTabLargeModeState(tabId, enabled);
  };

  const setLargeFileLocateEnabled = (tabId: string, enabled: boolean) => {
    largeFileLocateEnabledRef.current[tabId] = enabled;
    setLargeFileLocateEnabledState(tabId, enabled);
  };

  const setStructureStatus = (tabId: string, status: StructureStatus) => {
    structureStatusRef.current[tabId] = status;
    setStructureStatusState(tabId, status);
  };

  const getTabContent = (tabId: string) => rawTextByTabRef.current[tabId] ?? '';

  const updateTabContent = (tabId: string, content: string, syncModel = false) => {
    const byteLength = getUtf8ByteLength(content);
    rawTextByTabRef.current[tabId] = content;
    setDocumentMeta(tabId, (current) => ({
      ...current,
      rawLength: byteLength,
    }));

    if (syncModel) {
      syncLeftModel(tabId, content, true);
    }
  };

  const updateFormattedContent = (tabId: string, content: string, syncModel = false) => {
    const byteLength = getUtf8ByteLength(content);
    formattedTextByTabRef.current[tabId] = content;
    setDocumentMeta(tabId, (current) => ({
      ...current,
      formattedLength: byteLength,
      formattedRevision: current.formattedRevision + 1,
    }));

    if (syncModel) {
      syncRightModel(tabId, content, true);
    }
  };

  const attachEditorModel = (
    editor: monaco.editor.IStandaloneCodeEditor | null,
    model: monaco.editor.ITextModel,
    viewState: monaco.editor.ICodeEditorViewState | null | undefined,
    event: string,
    details: Record<string, unknown>
  ) => {
    if (!editor) {
      return;
    }

    const shouldSwitchModel = editor.getModel() !== model;

    if (shouldSwitchModel) {
      editor.setModel(model);
      logEvent(event, details);

      if (viewState) {
        editor.restoreViewState(viewState);
      }
    }

    editor.layout();
  };

  const syncLeftModel = (tabId: string, content: string, forceValue = false) => {
    const path = getLeftModelPath(tabId);
    const byteLength = getUtf8ByteLength(content);
    const language = getEditorLanguageByLength(byteLength);
    let model = getOrCreateModel(path, language);

    if (
      forceValue
      || model.getValueLength() !== content.length
      || model.getLanguageId() !== language
    ) {
      if (activeTabIdRef.current === tabId) {
        leftViewStateByTabRef.current[tabId] = leftEditorRef.current?.saveViewState() ?? leftViewStateByTabRef.current[tabId] ?? null;
      }
      suppressLeftChangeRef.current[tabId] = true;
      model = recreateModel(
        path,
        language,
        content,
        activeTabIdRef.current === tabId ? leftEditorRef.current : null
      );
      suppressLeftChangeRef.current[tabId] = false;
      logEvent(forceValue ? 'left-model-value-written' : 'left-model-value-synced', {
        tabId,
        rawLength: byteLength,
      });
    }

    if (activeTabIdRef.current === tabId) {
      attachEditorModel(leftEditorRef.current, model, leftViewStateByTabRef.current[tabId], 'left-model-attached', {
        tabId,
        path,
        rawLength: byteLength,
      });
    }
  };

  const syncRightModel = (tabId: string, content: string, forceValue = false) => {
    const path = getRightModelPath(tabId);
    const byteLength = getUtf8ByteLength(content);
    const rawText = rawTextByTabRef.current[tabId] ?? '';
    const rawByteLength = getUtf8ByteLength(rawText);
    const enableStructuralFolding = rawByteLength <= STRUCTURE_SYNC_THRESHOLD;
    const effectiveLargeMode = largeModeRef.current[tabId] || isLargeDocument(rawText);
    const language = rawByteLength > 0 && rawByteLength <= STRUCTURE_SYNC_THRESHOLD
      ? 'json'
      : getEditorLanguageByLength(byteLength);
    let model = getOrCreateModel(path, language);

    if (
      forceValue
      || model.getValueLength() !== content.length
      || model.getLanguageId() !== language
    ) {
      if (activeTabIdRef.current === tabId) {
        rightViewStateByTabRef.current[tabId] = rightEditorRef.current?.saveViewState() ?? rightViewStateByTabRef.current[tabId] ?? null;
      }
      model = recreateModel(
        path,
        language,
        content,
        activeTabIdRef.current === tabId ? rightEditorRef.current : null
      );
      logEvent(forceValue ? 'right-model-value-written' : 'right-model-value-synced', {
        tabId,
        formattedLength: byteLength,
      });
    }

    if (enableStructuralFolding) {
      forceEnableModelTokenization(model);
    }

    if (activeTabIdRef.current === tabId) {
      attachEditorModel(rightEditorRef.current, model, rightViewStateByTabRef.current[tabId], 'right-model-attached', {
        tabId,
        path,
        formattedLength: byteLength,
        language,
        largeMode: effectiveLargeMode,
        enableStructuralFolding,
      });
      rightEditorRef.current?.updateOptions(
        getMonacoOptions(effectiveLargeMode, true, enableStructuralFolding)
      );
      rightEditorRef.current?.layout();
      logRightEditorState('right-editor-state', tabId, {
        context: forceValue ? 'sync-force' : 'sync',
        language,
        enableStructuralFolding,
        effectiveLargeMode,
      });
    }
  };

  const revealLeftRange = (startOffset: number, endOffset: number) => {
    const leftEditor = leftEditorRef.current;
    const leftModel = leftEditor?.getModel();

    if (!leftEditor || !leftModel) {
      return;
    }

    const start = leftModel.getPositionAt(startOffset);
    const end = leftModel.getPositionAt(endOffset);
    const range = new monaco.Range(
      start.lineNumber,
      start.column,
      end.lineNumber,
      end.column
    );

    leftEditor.revealRangeInCenter(range);
    leftEditor.setSelection(
      new monaco.Selection(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column
      )
    );

    leftDecorationIdsRef.current = leftEditor.deltaDecorations(
      leftDecorationIdsRef.current,
      [{
        range,
        options: { inlineClassName: 'currentSearchHighlight' },
      }]
    );

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      clearLeftHighlights();
    }, SEARCH_HIGHLIGHT_DURATION);
  };

  const {
    clearTabStructure,
    importJsonFile,
    queueFormat,
    removeTabArtifacts,
    requestWorkerLocate,
    requestWorkerValue,
    resetTabArtifacts,
  } = useJsonFormattingWorker({
    activeTabIdRef,
    largeModeRef,
    largeFileLocateEnabledRef,
    leftViewStateByTabRef,
    rightViewStateByTabRef,
    structureStatusRef,
    workerStructureEnabledRef,
    rawTextByTabRef,
    formattedTextByTabRef,
    performanceSessionsRef,
    beginPerformanceSession,
    clearPerformanceState,
    logEvent,
    mutatePerformanceSession,
    syncPerformanceSnapshot,
    renameTab,
    removeTabState,
    setTabError,
    setTabImporting,
    setTabFormatting,
    setTabLargeMode,
    setStructureStatus,
    updateTabContent,
    updateFormattedContent,
    resetSearchState,
    revealLeftRange,
    clearLeftHighlights,
    clearRightHighlights,
  });

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    const previousTabId = previousActiveTabIdRef.current;

    if (previousTabId && previousTabId !== activeTabId) {
      leftViewStateByTabRef.current[previousTabId] = leftEditorRef.current?.saveViewState() ?? null;
      rightViewStateByTabRef.current[previousTabId] = rightEditorRef.current?.saveViewState() ?? null;
    }

    previousActiveTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    window.localStorage.setItem(
      PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY,
      String(showPerformancePanel)
    );
  }, [showPerformancePanel]);

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    const currentRaw = getTabContent(activeTab.id);
    const currentFormatted = formattedTextByTabRef.current[activeTab.id] ?? '';
    syncLeftModel(activeTab.id, currentRaw);
    syncRightModel(activeTab.id, currentFormatted);
  }, [activeTab, activeDocumentMeta.formattedLength, activeDocumentMeta.rawLength]);

  useEffect(() => {
    leftEditorRef.current?.updateOptions(getMonacoOptions(isLargeFileMode));
    leftEditorRef.current?.layout();
    rightEditorRef.current?.updateOptions(
      getMonacoOptions(isLargeFileMode, true, shouldEnableRightPaneFolding)
    );
    rightEditorRef.current?.layout();
    if (activeTab) {
      logRightEditorState(activeTab.id === activeTabId ? 'right-editor-options-refreshed' : 'right-editor-options-skipped', activeTab.id, {
        isLargeFileMode,
        shouldEnableRightPaneFolding,
        wrapLongLines,
      });
    }
  }, [activeTabId, isLargeFileMode, shouldEnableRightPaneFolding, wrapLongLines]);

  useEffect(() => (
    () => {
      if (copyLiteralTimeoutRef.current !== null) {
        window.clearTimeout(copyLiteralTimeoutRef.current);
      }
    }
  ), []);

  useEffect(() => {
    resetSearchState();
  }, [activeTabId]);

  useEffect(() => {
    const editor = rightEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || !searchTerm) {
      setRightMatches([]);
      clearRightHighlights();
      return;
    }

    const matches = model.findMatches(searchTerm, true, true, false, null, true);
    setRightMatches(matches);

    const nextDecorations = matches.map((match, index) => ({
      range: match.range,
      options: {
        inlineClassName:
          index === currentMatchIndex ? 'currentSearchHighlight' : 'searchHighlight',
      },
    }));

    rightDecorationIdsRef.current = editor.deltaDecorations(
      rightDecorationIdsRef.current,
      nextDecorations
    );

    if (matches.length === 0) {
      return;
    }

    const activeMatch = matches[currentMatchIndex % matches.length];
    editor.revealRangeInCenter(activeMatch.range);

    const leftEditor = leftEditorRef.current;
    const leftModel = leftEditor?.getModel();
    if (!leftEditor || !leftModel) {
      return;
    }

    const snippet = model.getValueInRange(activeMatch.range);
    const leftMatch = leftModel.findNextMatch(
      snippet,
      new monaco.Position(1, 1),
      false,
      false,
      null,
      false
    );

    if (!leftMatch) {
      clearLeftHighlights();
      return;
    }

    leftEditor.revealRangeInCenter(leftMatch.range);
    leftEditor.setSelection(
      new monaco.Selection(
        leftMatch.range.startLineNumber,
        leftMatch.range.startColumn,
        leftMatch.range.endLineNumber,
        leftMatch.range.endColumn
      )
    );

    leftDecorationIdsRef.current = leftEditor.deltaDecorations(
      leftDecorationIdsRef.current,
      [{
        range: leftMatch.range,
        options: { inlineClassName: 'currentSearchHighlight' },
      }]
    );

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      clearLeftHighlights();
    }, SEARCH_HIGHLIGHT_DURATION);
  }, [activeTabId, activeDocumentMeta.formattedRevision, currentMatchIndex, searchTerm]);

  const getMonacoOptions = (
    largeMode: boolean,
    readOnly = false,
    enableStructuralFolding = !largeMode
  ): monaco.editor.IStandaloneEditorConstructionOptions => {
    const preserveFoldingForLargeReadonly = readOnly && enableStructuralFolding;

    return {
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      largeFileOptimizations: preserveFoldingForLargeReadonly ? false : true,
    wordWrap: wrapLongLines ? 'on' : 'off',
    folding: enableStructuralFolding,
    showFoldingControls: enableStructuralFolding ? 'always' : 'never',
    foldingStrategy: 'indentation',
    foldingMaximumRegions: preserveFoldingForLargeReadonly ? 50000 : 5000,
    foldingHighlight: enableStructuralFolding,
    glyphMargin: enableStructuralFolding,
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    renderWhitespace: 'none',
    renderValidationDecorations: 'off',
    matchBrackets: 'never',
    fontLigatures: false,
    codeLens: false,
    lineDecorationsWidth: enableStructuralFolding ? 16 : 0,
    lineNumbersMinChars: 3,
    maxTokenizationLineLength: largeMode ? 2000 : 1000000,
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false,
    },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    scrollbar: {
      alwaysConsumeMouseWheel: true,
    },
    wordBasedSuggestions: largeMode ? 'off' : 'currentDocument',
    hover: {
      enabled: !largeMode,
    },
    links: !largeMode,
    readOnly,
    guides: {
      indentation: false,
    },
    };
  };

  const handleLeftMount: OnMount = (editor) => {
    leftEditorRef.current = editor;
    const currentTabId = activeTabIdRef.current;
    syncLeftModel(currentTabId, getTabContent(currentTabId), true);

    editor.onDidDispose(() => {
      if (leftEditorRef.current === editor) {
        leftEditorRef.current = null;
      }
    });

    editor.addCommand(monaco.KeyCode.Delete, () => {
      const currentTabId = activeTabIdRef.current;

      if (selectionCoversModel(editor) && currentTabId) {
        renameTab(currentTabId, DEFAULT_TAB_TITLE);
        resetTabArtifacts(currentTabId);
        resetSearchState();
        return;
      }

      editor.trigger('', 'deleteRight', null);
    });

    editor.addCommand(monaco.KeyCode.Backspace, () => {
      const currentTabId = activeTabIdRef.current;

      if (selectionCoversModel(editor) && currentTabId) {
        renameTab(currentTabId, DEFAULT_TAB_TITLE);
        resetTabArtifacts(currentTabId);
        resetSearchState();
        return;
      }

      editor.trigger('', 'deleteLeft', null);
    });

    editor.addAction({
      id: 'custom.clipboardPasteAction',
      label: 'Custom Paste',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 1,
      run: async (mountedEditor) => {
        const currentTabId = activeTabIdRef.current;
        const text = await navigator.clipboard.readText();
        const selection = mountedEditor.getSelection();

        if (!selection || !currentTabId) {
          return;
        }

        if (selectionCoversModel(mountedEditor)) {
          const largeMode = isLargeDocument(text);

          updateTabContent(currentTabId, text, true);
          setTabLargeMode(currentTabId, largeMode);
          resetSearchState();
          queueFormat(currentTabId, text, true);
          return;
        }

        mountedEditor.executeEdits('paste', [{
          range: selection,
          text,
          forceMoveMarkers: true,
        }]);
      },
    });
  };

  const handleRightMount: OnMount = (editor) => {
    rightEditorRef.current = editor;
    const currentTabId = activeTabIdRef.current;
    syncRightModel(currentTabId, formattedTextByTabRef.current[currentTabId] ?? '', true);
    logRightEditorState('right-editor-mounted', currentTabId, {
      wrapLongLines,
    });

    editor.onDidDispose(() => {
      if (rightEditorRef.current === editor) {
        rightEditorRef.current = null;
      }
    });

    editor.onDidChangeCursorPosition((event) => {
      const currentTabId = activeTabIdRef.current;

      if (
        largeModeRef.current[currentTabId]
        || !workerStructureEnabledRef.current[currentTabId]
        || structureStatusRef.current[currentTabId] !== 'ready'
      ) {
        return;
      }

      const rightModel = editor.getModel();

      if (
        !rightModel ||
        (event.position.lineNumber === 1 && event.position.column === 1)
      ) {
        return;
      }

      requestWorkerLocate(currentTabId, rightModel.getOffsetAt(event.position));
    });

    editor.onMouseUp(() => {
      const currentTabId = activeTabIdRef.current;

      if (!largeModeRef.current[currentTabId] || !workerStructureEnabledRef.current[currentTabId]) {
        return;
      }

      if (structureStatusRef.current[currentTabId] !== 'ready') {
        return;
      }

      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) {
        return;
      }

      requestWorkerLocate(currentTabId, model.getOffsetAt(position));
    });

    editor.onDidChangeHiddenAreas(() => {
      const currentTabId = activeTabIdRef.current;
      rightViewStateByTabRef.current[currentTabId] = editor.saveViewState() ?? null;
    });

    editor.addAction({
      id: 'copyValueAction',
      label: '复制值',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: async (mountedEditor) => {
        const currentTabId = activeTabIdRef.current;
        const model = mountedEditor.getModel();
        const position = mountedEditor.getPosition();

        if (!model || !position) {
          return;
        }

        const offset = model.getOffsetAt(position);
        const valueToCopy = await requestWorkerValue(currentTabId, offset);
        if (valueToCopy === null) {
          return;
        }

        await navigator.clipboard.writeText(valueToCopy);
      },
    });
  };

  const handleLeftChange = (value?: string) => {
    if (!activeTab) {
      return;
    }

    if (suppressLeftChangeRef.current[activeTab.id]) {
      return;
    }

    const nextContent = value ?? '';
    const largeMode = isLargeDocument(nextContent);
    updateTabContent(activeTab.id, nextContent);
    setTabLargeMode(activeTab.id, largeMode);
    queueFormat(activeTab.id, nextContent);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !activeTab) {
      return;
    }

    await importJsonFile(activeTab.id, file);
  };

  const handleFormat = () => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    if (!currentText.trim()) {
      clearPerformanceState(activeTab.id);
      queueFormat(activeTab.id, currentText, true);
      return;
    }

    const largeMode = isLargeDocument(currentText);
    beginPerformanceSession(
      activeTab.id,
      'manual-format',
      activeTab.title,
      null,
      getUtf8ByteLength(currentText),
      largeMode
    );
    setTabLargeMode(activeTab.id, largeMode);
    queueFormat(activeTab.id, currentText, true);
  };

  const handleOpenEditJson = () => {
    if (!activeTab) {
      return;
    }

    try {
      const raw = getTabContent(activeTab.id);
      const formatted = JSON.stringify(JSON.parse(raw), null, 2);
      editJsonValueRef.current = formatted;
      setEditJsonError(null);
      clearCopyLiteralNotice();
      setEditJsonSession({
        key: Date.now(),
        initialValue: formatted,
      });
    } catch (error) {
      setTabError(
        activeTab.id,
        error instanceof Error ? `打开 JSON 编辑失败：${error.message}` : '打开 JSON 编辑失败'
      );
    }
  };

  const closeEditJson = () => {
    setEditJsonSession(null);
    setEditJsonError(null);
    clearCopyLiteralNotice();
  };

  const handleSaveEditJson = () => {
    if (!activeTab) {
      return;
    }

    try {
      const updated = JSON.stringify(JSON.parse(editJsonValueRef.current), null, 2);
      const largeMode = isLargeDocument(updated);
      beginPerformanceSession(
        activeTab.id,
        'edit-save',
        activeTab.title,
        null,
        getUtf8ByteLength(updated),
        largeMode
      );

      mutatePerformanceSession(activeTab.id, (session) => {
        session.leftModelStartedAt = performance.now();
      });
      updateTabContent(activeTab.id, updated, true);
      mutatePerformanceSession(activeTab.id, (session) => {
        session.leftModelCompletedAt = performance.now();
      });
      setTabLargeMode(activeTab.id, largeMode);
      setEditJsonError(null);
      closeEditJson();
      resetSearchState();
      queueFormat(activeTab.id, updated, true);
    } catch (error) {
      setEditJsonError(
        error instanceof Error ? `保存 JSON 失败：${error.message}` : '保存 JSON 失败'
      );
    }
  };

  const handleCopyEscapedJson = async () => {
    try {
      const jsonText = JSON.stringify(JSON.parse(editJsonValueRef.current));
      const literal = JSON.stringify(jsonText);
      await navigator.clipboard.writeText(literal);
      setEditJsonError(null);
      setHasCopiedLiteral(true);
      if (copyLiteralTimeoutRef.current !== null) {
        window.clearTimeout(copyLiteralTimeoutRef.current);
      }
      copyLiteralTimeoutRef.current = window.setTimeout(() => {
        setHasCopiedLiteral(false);
        copyLiteralTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      setEditJsonError(
        error instanceof Error ? `复制字符串字面量失败：${error.message}` : '复制字符串字面量失败'
      );
    }
  };

  const handleLargeFileLocateToggle = (enabled: boolean) => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    const largeMode = isLargeDocument(currentText);
    setLargeFileLocateEnabled(activeTab.id, enabled);

    if (!largeMode) {
      setStructureStatus(activeTab.id, 'ready');
      return;
    }

    if (!enabled) {
      clearTabStructure(activeTab.id, 'disabled');
      return;
    }

    if (!canUseStructureSync(currentText)) {
      setStructureStatus(activeTab.id, 'disabled');
      return;
    }

    queueFormat(activeTab.id, currentText, true);
  };

  const handleClear = () => {
    if (!activeTab) {
      return;
    }

    renameTab(activeTab.id, DEFAULT_TAB_TITLE);
    resetTabArtifacts(activeTab.id);
    resetSearchState();
  };

  const addTab = () => {
    const nextId = `tab-${Date.now()}`;
    const currentTabId = activeTabIdRef.current;

    if (currentTabId) {
      leftViewStateByTabRef.current[currentTabId] = leftEditorRef.current?.saveViewState() ?? leftViewStateByTabRef.current[currentTabId] ?? null;
      rightViewStateByTabRef.current[currentTabId] = rightEditorRef.current?.saveViewState() ?? rightViewStateByTabRef.current[currentTabId] ?? null;
    }

    rawTextByTabRef.current[nextId] = '';
    formattedTextByTabRef.current[nextId] = '';
    initializeTabState(nextId);
    setPerformanceByTab((current) => ({ ...current, [nextId]: null }));
    largeModeRef.current[nextId] = false;
    largeFileLocateEnabledRef.current[nextId] = false;
    structureStatusRef.current[nextId] = 'ready';
    workerStructureEnabledRef.current[nextId] = false;
    setTabs((currentTabs) => [...currentTabs, createTab(nextId)]);
    setActiveTabId(nextId);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) {
      handleClear();
      return;
    }

    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    const fallbackTab = tabs[closingIndex === 0 ? 1 : closingIndex - 1];

    setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== tabId));
    removeTabArtifacts(tabId);

    if (activeTabId === tabId) {
      setActiveTabId(fallbackTab.id);
    }
  };

  const gotoNext = () => {
    if (rightMatches.length === 0) {
      return;
    }

    setCurrentMatchIndex((current) => (current + 1) % rightMatches.length);
  };

  const gotoPrev = () => {
    if (rightMatches.length === 0) {
      return;
    }

    setCurrentMatchIndex((current) => (current - 1 + rightMatches.length) % rightMatches.length);
  };

  const handleSearchTermChange = (value: string) => {
    setSearchTerm(value);
    setCurrentMatchIndex(0);
  };

  if (!activeTab) {
    return null;
  }

  return (
    <div
      className={isDarkMode ? 'app-container dark-mode' : 'app-container'}
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.txt,application/json,text/plain"
        style={{ display: 'none' }}
        onChange={handleFileSelection}
      />


      <JsonToolToolbar
        onImport={handleImport}
        onFormat={handleFormat}
        onClear={handleClear}
        onEditJson={handleOpenEditJson}
        onFoldAll={() => rightEditorRef.current?.getAction('editor.foldAll')?.run()}
        onUnfoldAll={() => rightEditorRef.current?.getAction('editor.unfoldAll')?.run()}
        isLargeFileMode={isLargeFileMode}
        canEditJson={canEditJson}
        searchTerm={searchTerm}
        onSearchTermChange={handleSearchTermChange}
        onPrevMatch={gotoPrev}
        onNextMatch={gotoNext}
        hasSearchMatches={rightMatches.length > 0}
        wrapLongLines={wrapLongLines}
        onWrapLongLinesChange={setWrapLongLines}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((current) => !current)}
        isLargeFileLocateEnabled={isLargeFileLocateEnabled}
        onLargeFileLocateToggle={handleLargeFileLocateToggle}
        showPerformancePanel={showPerformancePanel}
        onShowPerformancePanelChange={setShowPerformancePanel}
        importingFileName={importingFileName}
        canEnableLargeFileLocate={canEnableLargeFileLocate}
        currentStructureStatus={currentStructureStatus}
        currentError={currentError}
      />

      {showPerformancePanel && (
        <JsonPerformancePanel
          snapshot={activePerformanceSnapshot}
          isDarkMode={isDarkMode}
        />
      )}

      <JsonToolTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        renamingTab={renamingTab}
        onSelectTab={setActiveTabId}
        onStartRenaming={startRenamingTab}
        onRenamingChange={handleRenamingChange}
        onFinishRenaming={finishRenaming}
        onCancelRenaming={cancelRenaming}
        onCloseTab={closeTab}
        onAddTab={addTab}
      />

      {editJsonSession && (
        <JsonEditModal
          sessionKey={editJsonSession.key}
          initialValue={editJsonSession.initialValue}
          isDarkMode={isDarkMode}
          error={editJsonError}
          hasCopiedLiteral={hasCopiedLiteral}
          onValueChange={(value) => {
            editJsonValueRef.current = value;
          }}
          onSave={handleSaveEditJson}
          onCopyLiteral={handleCopyEscapedJson}
          onClose={closeEditJson}
        />
      )}

      <Split
        sizes={[50, 50]}
        minSize={200}
        gutterSize={6}
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          className="editor-pane"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            borderRight: isDarkMode ? '1px solid #444' : '1px solid #ddd',
            overflow: 'hidden',
            overscrollBehavior: 'contain',
          }}
        >
          <div className={`editor-pane-header editor-pane-header-subtle ${isDarkMode ? 'dark' : ''}`}>
            <span className="editor-pane-header-text">{leftPaneMetaText}</span>
          </div>
          <div className="editor-pane-body">
            <Editor
              onMount={handleLeftMount}
              theme={isDarkMode ? 'vs-dark' : 'vs-light'}
              options={getMonacoOptions(isLargeFileMode)}
              onChange={handleLeftChange}
              height="100%"
              loading={null}
            />
            {activeDocumentMeta.rawLength === 0 && !isImportingActiveTab && (
              <div className="editor-center-placeholder">原始 JSON</div>
            )}
            {isImportingActiveTab && (
              <div className="editor-loading-overlay">
                {`正在导入 ${importingFileName}...`}
              </div>
            )}
          </div>
        </div>

        <div
          className="editor-pane"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            overscrollBehavior: 'contain',
          }}
        >
          <div className={`editor-pane-header ${isDarkMode ? 'dark' : ''}`}>
            <span className="editor-pane-header-text">{rightPaneMetaText}</span>
            <span className={`editor-pane-header-flag ${isLargeFileMode ? 'visible' : ''}`}>
              轻量模式
            </span>
          </div>
          <div className="editor-pane-body">
            <Editor
              onMount={handleRightMount}
              theme={isDarkMode ? 'vs-dark' : 'vs-light'}
              options={getMonacoOptions(isLargeFileMode, true, shouldEnableRightPaneFolding)}
              height="100%"
              loading={null}
            />
            {!formattedValue && !isImportingActiveTab && (
              <div className="editor-center-placeholder">
                {isFormattingActiveTab ? '正在格式化...' : '格式化结果'}
              </div>
            )}
            {isImportingActiveTab && (
              <div className="editor-loading-overlay">正在读取文件...</div>
            )}
          </div>
        </div>
      </Split>
    </div>
  );
};

export default App;

