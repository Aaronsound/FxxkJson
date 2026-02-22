import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { findNodeAtLocation, getLocation, parseTree, Node as JsonNode } from 'jsonc-parser';
import Toolbar from './components/Toolbar';
import TabBar from './components/TabBar';
import JsonSplitView from './components/JsonSplitView';
import EditJsonModal from './components/EditJsonModal';
import { Tab } from './types/app';
import { useNotifier } from './hooks/useNotifier';
import { useTabs } from './hooks/useTabs';
import { useJsonFormatterWorker } from './hooks/useJsonFormatterWorker';
import { extractFileName, formatJson, toEscapedJsonLiteral } from './utils/json';
import './App.css';

const INITIAL_TAB_ID = 'tab-1';
type FoldAwareEditor = monaco.editor.IStandaloneCodeEditor & {
  getHiddenAreas?: () => monaco.Range[];
  setHiddenAreas?: (ranges: monaco.IRange[]) => void;
  _getViewModel?: () => {
    getHiddenAreas?: () => monaco.Range[];
  } | null;
  getContribution?: (id: string) => unknown;
};

type FoldingContributionState = {
  collapsedRegions?: unknown[];
  lineCount?: number;
  provider?: string;
  foldedImports?: boolean;
};

const INITIAL_TAB: Tab = {
  id: INITIAL_TAB_ID,
  title: 'HelloJson',
  content: '',
};

const App: React.FC = () => {
  const notifier = useNotifier();

  // 编辑器实例引用
  const leftEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const rightEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // 左右 JSON AST，提供路径定位/高亮功能
  const leftTreeRef = useRef<JsonNode | undefined>(undefined);
  const rightTreeRef = useRef<JsonNode | undefined>(undefined);
  const leftTreeCacheRef = useRef<Record<string, { text: string; tree: JsonNode | undefined }>>({});
  const rightTreeCacheRef = useRef<Record<string, { text: string; tree: JsonNode | undefined }>>({});
  const rightViewStateByTabRef = useRef<Record<string, monaco.editor.ICodeEditorViewState | null>>({});
  const rightFoldingStateByTabRef = useRef<Record<string, FoldingContributionState | undefined>>({});
  const rightHiddenAreasByTabRef = useRef<Record<string, monaco.IRange[]>>({});
  const rightLastInteractionAtByTabRef = useRef<Record<string, number>>({});
  const rightRestoreTimersRef = useRef<number[]>([]);
  const rightRestoreGuardRef = useRef<{ tabId: string; expected: monaco.IRange[]; expiresAt: number } | null>(null);
  const rightRestoreSessionRef = useRef<{ tabId: string; sessionId: number } | null>(null);
  const rightRestoreSessionSeqRef = useRef(0);
  const rightInactiveWriteGuardByTabRef = useRef<Record<string, { minWeight: number; expiresAt: number }>>({});
  const isRightViewStateSyncRef = useRef(false);
  const leftParseTimerRef = useRef<number | null>(null);
  const formatTimerByTabRef = useRef<Record<string, number>>({});

  const {
    tabs,
    activeTabId,
    renamingTab,
    setActiveTabId,
    setRenamingTab,
    updateTabContent,
    renameTab,
    addTab,
    closeTab,
    startRenaming,
    finishRenaming,
    cancelRenaming,
  } = useTabs({
    initialTabs: [INITIAL_TAB],
    initialActiveTabId: INITIAL_TAB_ID,
  });

  const { rightValues, workerError, setWorkerError, ensureTabValue, removeTabValue, clearTabValue, formatInWorker } =
    useJsonFormatterWorker({ initialTabId: INITIAL_TAB_ID });

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [wrapLongLines, setWrapLongLines] = useState(false);
  const [splitSizes, setSplitSizes] = useState<[number, number]>([50, 50]);

  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [rightMatches, setRightMatches] = useState<monaco.editor.FindMatch[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const rightMatchesRef = useRef<monaco.editor.FindMatch[]>([]);
  const rightDecsRef = useRef<string[]>([]);
  const leftDecsRef = useRef<string[]>([]);
  const searchTimerRef = useRef<number | null>(null);

  const [isEditingData, setIsEditingData] = useState(false);
  const [editingDataValue, setEditingDataValue] = useState('');
  const [hasCopied, setHasCopied] = useState(false);

  const activeTabIdRef = useRef(INITIAL_TAB_ID);
  const lastActiveTabIdForRightTextRef = useRef(INITIAL_TAB_ID);
  const tabsRef = useRef<Tab[]>(tabs);
  const rightValuesRef = useRef<Record<string, string>>(rightValues);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    rightValuesRef.current = rightValues;
  }, [rightValues]);

  useEffect(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    const leftText = activeTab?.content || '';
    const rightText = rightValues[activeTabId] || '';
    const leftCached = leftTreeCacheRef.current[activeTabId];
    leftTreeRef.current = leftCached && leftCached.text === leftText ? leftCached.tree : undefined;
    const rightCached = rightTreeCacheRef.current[activeTabId];
    rightTreeRef.current = rightCached && rightCached.text === rightText ? rightCached.tree : undefined;
  }, [activeTabId, tabs, rightValues]);

  const activeRightText = rightValues[activeTabId] || '';

  useEffect(() => {
    return () => {
      if (leftParseTimerRef.current !== null) {
        window.clearTimeout(leftParseTimerRef.current);
      }
      Object.values(formatTimerByTabRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
      }
      rightRestoreTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      rightRestoreTimersRef.current = [];
      rightRestoreGuardRef.current = null;
      rightRestoreSessionRef.current = null;
    };
  }, []);

  const displayError = error || workerError;
  const foldLog = (action: string, payload?: Record<string, unknown>) => {
    if (!import.meta.env.DEV) return;
    const stamp = new Date().toISOString().slice(11, 23);
    // 统一前缀，便于在 DevTools 里按 fold-debug 过滤。
    console.debug(`[fold-debug ${stamp}] ${action}`, payload || {});
  };

  const ensureLeftTree = (tabId: string, leftText: string): JsonNode | undefined => {
    const cached = leftTreeCacheRef.current[tabId];
    if (cached && cached.text === leftText) {
      return cached.tree;
    }
    const tree = leftText ? parseTree(leftText) : undefined;
    leftTreeCacheRef.current[tabId] = { text: leftText, tree };
    return tree;
  };

  const ensureRightTree = (tabId: string, rightText: string): JsonNode | undefined => {
    const cached = rightTreeCacheRef.current[tabId];
    if (cached && cached.text === rightText) {
      return cached.tree;
    }
    const tree = rightText ? parseTree(rightText) : undefined;
    rightTreeCacheRef.current[tabId] = { text: rightText, tree };
    return tree;
  };

  const isWholeModelSelection = (
    model: monaco.editor.ITextModel,
    selection: monaco.Selection | monaco.Range
  ): boolean => {
    const full = model.getFullModelRange();
    return (
      selection.startLineNumber === full.startLineNumber &&
      selection.startColumn === full.startColumn &&
      selection.endLineNumber === full.endLineNumber &&
      selection.endColumn === full.endColumn
    );
  };

  const getRightModelTabId = (editor: monaco.editor.IStandaloneCodeEditor): string | null => {
    const model = editor.getModel();
    if (!model) return null;
    const match = model.uri.path.match(/formatted-(.+)$/);
    return match ? match[1] : null;
  };

  const normalizeHiddenAreas = (areas: monaco.IRange[] | monaco.Range[]): monaco.IRange[] =>
    areas.map((area) => ({
      startLineNumber: area.startLineNumber,
      startColumn: area.startColumn,
      endLineNumber: area.endLineNumber,
      endColumn: area.endColumn,
    }));

  const areHiddenAreasEqual = (a: monaco.IRange[], b: monaco.IRange[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (
        a[i].startLineNumber !== b[i].startLineNumber ||
        a[i].startColumn !== b[i].startColumn ||
        a[i].endLineNumber !== b[i].endLineNumber ||
        a[i].endColumn !== b[i].endColumn
      ) {
        return false;
      }
    }
    return true;
  };

  const getHiddenAreaWeight = (areas: monaco.IRange[]): number =>
    areas.reduce((total, area) => total + Math.max(0, area.endLineNumber - area.startLineNumber + 1), 0);

  const readEditorHiddenAreas = (
    editor: monaco.editor.IStandaloneCodeEditor
  ): { areas: monaco.IRange[]; source: 'public' | 'viewModel' | 'none' } => {
    const foldEditor = editor as FoldAwareEditor;
    if (typeof foldEditor.getHiddenAreas === 'function') {
      return { areas: normalizeHiddenAreas(foldEditor.getHiddenAreas()), source: 'public' };
    }

    const viewModel = foldEditor._getViewModel?.();
    if (viewModel && typeof viewModel.getHiddenAreas === 'function') {
      return { areas: normalizeHiddenAreas(viewModel.getHiddenAreas()), source: 'viewModel' };
    }

    return { areas: [], source: 'none' };
  };

  const setEditorHiddenAreas = (editor: monaco.editor.IStandaloneCodeEditor, ranges: monaco.IRange[]) => {
    const foldEditor = editor as FoldAwareEditor;
    if (typeof foldEditor.setHiddenAreas !== 'function') {
      return;
    }
    foldEditor.setHiddenAreas(ranges);
  };

  const getFoldingContribution = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const foldEditor = editor as FoldAwareEditor;
    const contribution = foldEditor.getContribution?.('editor.contrib.folding');
    return contribution as
      | {
          saveViewState?: () => FoldingContributionState | undefined;
          restoreViewState?: (state: FoldingContributionState | undefined) => void;
        }
      | undefined;
  };

  const saveFoldingContributionState = (
    editor: monaco.editor.IStandaloneCodeEditor
  ): FoldingContributionState | undefined => {
    return getFoldingContribution(editor)?.saveViewState?.();
  };

  const restoreFoldingContributionState = (
    editor: monaco.editor.IStandaloneCodeEditor,
    state: FoldingContributionState | undefined
  ) => {
    if (!state) return;
    getFoldingContribution(editor)?.restoreViewState?.(state);
  };

  const getCollapsedRegionCount = (state: FoldingContributionState | undefined): number => {
    return Array.isArray(state?.collapsedRegions) ? state.collapsedRegions.length : 0;
  };

  const getHiddenAreaContainingLine = (areas: monaco.IRange[], lineNumber: number): monaco.IRange | null => {
    for (const area of areas) {
      if (lineNumber >= area.startLineNumber && lineNumber <= area.endLineNumber) {
        return area;
      }
    }
    return null;
  };

  const markRightInteraction = (tabId: string | null) => {
    if (!tabId) return;
    rightLastInteractionAtByTabRef.current[tabId] = Date.now();
  };

  const shouldKeepPreviousFoldingState = (
    tabId: string,
    nextCollapsedRegionCount: number,
    nextHiddenCount: number,
    source: 'persist' | 'hiddenAreas'
  ): boolean => {
    const prevCollapsedRegionCount = getCollapsedRegionCount(rightFoldingStateByTabRef.current[tabId]);
    if (prevCollapsedRegionCount <= 0) {
      return false;
    }

    const lastInteractionAt = rightLastInteractionAtByTabRef.current[tabId] || 0;
    const interactionAgeMs = Date.now() - lastInteractionAt;
    const hasRecentInteraction = interactionAgeMs <= 1200;

    // 切 tab 持久化时，Monaco 的 folding contribution 可能短暂落后于 hiddenAreas。
    // 此时保留上一份折叠状态，避免把 2 个折叠误写成 1 个导致后续展开异常。
    if (
      source === 'persist' &&
      nextHiddenCount > 0 &&
      nextHiddenCount > nextCollapsedRegionCount &&
      prevCollapsedRegionCount >= nextHiddenCount
    ) {
      foldLog('folding:keep-previous-lag', {
        source,
        tabId,
        prevCollapsedRegionCount,
        nextCollapsedRegionCount,
        nextHiddenCount,
      });
      return true;
    }

    if (nextCollapsedRegionCount > 0) {
      // 非用户交互场景下，如果折叠数量短暂回退但 hiddenAreas 没减少，视为模型尚未收敛，保留旧值。
      if (
        !hasRecentInteraction &&
        nextCollapsedRegionCount < prevCollapsedRegionCount &&
        nextHiddenCount >= prevCollapsedRegionCount
      ) {
        foldLog('folding:keep-previous-regression', {
          source,
          tabId,
          prevCollapsedRegionCount,
          nextCollapsedRegionCount,
          nextHiddenCount,
          interactionAgeMs,
        });
        return true;
      }
      return false;
    }

    if (hasRecentInteraction) {
      return false;
    }

    foldLog('folding:keep-previous', {
      source,
      tabId,
      prevCollapsedRegionCount,
      nextCollapsedRegionCount,
      interactionAgeMs,
    });
    return true;
  };

  const clearRightRestoreTimers = () => {
    rightRestoreTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    rightRestoreTimersRef.current = [];
  };

  const cancelPendingRestoreForTab = (tabId: string, reason: string) => {
    if (!tabId) return;
    const hasPendingTimers = rightRestoreTimersRef.current.length > 0;
    const hasRestoreGuard = rightRestoreGuardRef.current?.tabId === tabId;
    const hasRestoreSession = rightRestoreSessionRef.current?.tabId === tabId;
    if (!hasPendingTimers && !hasRestoreGuard && !hasRestoreSession) return;

    clearRightRestoreTimers();
    if (hasRestoreGuard) {
      rightRestoreGuardRef.current = null;
    }
    if (hasRestoreSession) {
      rightRestoreSessionRef.current = null;
    }
    foldLog('restore:cancel-by-interaction', {
      tabId,
      reason,
      hadPendingTimers: hasPendingTimers,
      hadRestoreGuard: hasRestoreGuard,
      hadRestoreSession: hasRestoreSession,
    });
  };

  const persistCurrentRightViewState = (reason = 'unknown') => {
    const editor = rightEditorRef.current;
    if (!editor) return null;

    const tabId = getRightModelTabId(editor) || activeTabIdRef.current;
    if (!tabId) return null;

    const hiddenRead = readEditorHiddenAreas(editor);
    const hiddenAreas = hiddenRead.areas;
    const hiddenWeight = getHiddenAreaWeight(hiddenAreas);
    const state = editor.saveViewState();
    const foldingState = saveFoldingContributionState(editor);
    const collapsedRegionCount = getCollapsedRegionCount(foldingState);
    const contributionState = (state as { contributionsState?: Record<string, unknown> } | null)?.contributionsState;
    const hasFoldingContribution = Boolean(contributionState && 'editor.contrib.folding' in contributionState);

    rightViewStateByTabRef.current[tabId] = state;
    const keepPreviousFoldingState = shouldKeepPreviousFoldingState(
      tabId,
      collapsedRegionCount,
      hiddenAreas.length,
      'persist'
    );
    if (!keepPreviousFoldingState) {
      rightFoldingStateByTabRef.current[tabId] = foldingState;
    }
    if (hiddenRead.source !== 'none' && !keepPreviousFoldingState) {
      rightHiddenAreasByTabRef.current[tabId] = hiddenAreas;
    }
    foldLog('persist', {
      reason,
      tabId,
      hiddenCount: hiddenAreas.length,
      hiddenWeight,
      hiddenSource: hiddenRead.source,
      hasHiddenApi: hiddenRead.source !== 'none',
      hasFoldingContribution,
      collapsedRegionCount,
      keepPreviousFoldingState,
      activeTabId: activeTabIdRef.current,
    });
    return { tabId, hiddenWeight };
  };

  const restoreRightViewStateForTab = (tabId: string, withRetry = true) => {
    const editor = rightEditorRef.current;
    if (!editor || !tabId) return;

    const state = rightViewStateByTabRef.current[tabId];
    const foldingState = rightFoldingStateByTabRef.current[tabId];
    const hiddenAreas = rightHiddenAreasByTabRef.current[tabId];
    if (!state && !foldingState && (!hiddenAreas || hiddenAreas.length === 0)) return;

    clearRightRestoreTimers();
    const sessionId = ++rightRestoreSessionSeqRef.current;
    rightRestoreSessionRef.current = { tabId, sessionId };
    const expectedHiddenAreas = hiddenAreas ? normalizeHiddenAreas(hiddenAreas) : [];
    const expectedHiddenWeight = getHiddenAreaWeight(expectedHiddenAreas);
    const expectedCollapsedRegionCount = getCollapsedRegionCount(foldingState);
    const shouldApplyHiddenAreasFallback = expectedHiddenAreas.length > 0 && expectedCollapsedRegionCount === 0;
    foldLog('restore:start', {
      tabId,
      withRetry,
      hasState: Boolean(state),
      hasFoldingState: Boolean(foldingState),
      collapsedRegionCount: expectedCollapsedRegionCount,
      expectedCount: expectedHiddenAreas.length,
      expectedWeight: expectedHiddenWeight,
      applyHiddenAreasFallback: shouldApplyHiddenAreasFallback,
      hasFoldingContribution: Boolean(
        (state as { contributionsState?: Record<string, unknown> } | null)?.contributionsState?.[
          'editor.contrib.folding'
        ]
      ),
    });
    if (shouldApplyHiddenAreasFallback) {
      rightRestoreGuardRef.current = {
        tabId,
        expected: expectedHiddenAreas,
        // 大文件下 folding 模型可能超过 2s 才稳定，适当延长保护窗口。
        expiresAt: Date.now() + 3600,
      };
    } else {
      rightRestoreGuardRef.current = null;
    }

    const applyOnce = (phase: string) => {
      isRightViewStateSyncRef.current = true;
      if (state) {
        editor.restoreViewState(state);
      }
      restoreFoldingContributionState(editor, foldingState);
      if (shouldApplyHiddenAreasFallback) {
        setEditorHiddenAreas(editor, expectedHiddenAreas);
        const pos = editor.getPosition();
        if (pos) {
          const containing = getHiddenAreaContainingLine(expectedHiddenAreas, pos.lineNumber);
          if (containing) {
            const safeLine = Math.max(1, containing.startLineNumber - 1);
            editor.setPosition(new monaco.Position(safeLine, 1));
            foldLog('restore:cursor-adjust', {
              tabId,
              phase,
              fromLine: pos.lineNumber,
              toLine: safeLine,
              hiddenStart: containing.startLineNumber,
              hiddenEnd: containing.endLineNumber,
            });
          }
        }
      }
      foldLog('restore:apply', {
        tabId,
        phase,
        applyFoldingState: Boolean(foldingState),
        collapsedRegionCount: expectedCollapsedRegionCount,
        expectedCount: expectedHiddenAreas.length,
        expectedWeight: expectedHiddenWeight,
        applyHiddenAreas: shouldApplyHiddenAreasFallback,
      });
      requestAnimationFrame(() => {
        isRightViewStateSyncRef.current = false;
      });
    };

    const queueApply = (delayMs: number, phase: string) => {
      const timerId = window.setTimeout(() => {
        const currentSession = rightRestoreSessionRef.current;
        if (!currentSession || currentSession.tabId !== tabId || currentSession.sessionId !== sessionId) {
          foldLog('restore:skip-stale-session', {
            tabId,
            phase,
            sessionId,
            currentSession,
          });
          return;
        }
        // 只对当前激活 tab 继续恢复，防止快速切换时串写。
        const currentTabId = getRightModelTabId(editor) || activeTabIdRef.current;
        if (currentTabId !== tabId) {
          foldLog('restore:skip-non-active', { tabId, phase, currentTabId });
          return;
        }
        applyOnce(phase);
      }, delayMs);
      rightRestoreTimersRef.current.push(timerId);
    };

    queueApply(0, 't+0');
    queueApply(16, 't+16');

    if (withRetry) {
      // 大 JSON 下 folding 信息会分批就绪，增加渐进重试。
      queueApply(80, 't+80');
      queueApply(220, 't+220');
      queueApply(480, 't+480');
      queueApply(900, 't+900');
      queueApply(1500, 't+1500');
      queueApply(2400, 't+2400');
      queueApply(3200, 't+3200');
    }
  };

  const getActiveTab = (): Tab | undefined => tabs.find((tab) => tab.id === activeTabId);

  const resetSearchState = () => {
    setSearchTerm('');
    setRightMatches([]);
    rightMatchesRef.current = [];
    rightDecsRef.current = [];
    setCurrentIdx(0);
  };

  const handleAddTab = () => {
    const fromTabId = activeTabIdRef.current;
    const saved = persistCurrentRightViewState('add-tab');
    if (saved && saved.tabId === fromTabId && saved.hiddenWeight > 0) {
      rightInactiveWriteGuardByTabRef.current[fromTabId] = {
        minWeight: saved.hiddenWeight,
        expiresAt: Date.now() + 2600,
      };
      foldLog('switch-guard:set', {
        tabId: fromTabId,
        reason: 'add-tab',
        minWeight: saved.hiddenWeight,
      });
    }
    const newTabId = addTab();
    ensureTabValue(newTabId);
    activeTabIdRef.current = newTabId;
    foldLog('tab:switch', { fromTabId, toTabId: newTabId, reason: 'add-tab' });
  };

  const handleCloseTab = (tabId: string) => {
    if (tabId === activeTabIdRef.current) {
      persistCurrentRightViewState('close-tab');
    }

    const pendingTimer = formatTimerByTabRef.current[tabId];
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      delete formatTimerByTabRef.current[tabId];
    }

    const result = closeTab(tabId);
    if (result.closed) {
      removeTabValue(tabId);
      delete rightViewStateByTabRef.current[tabId];
      delete rightFoldingStateByTabRef.current[tabId];
      delete rightHiddenAreasByTabRef.current[tabId];
      delete rightLastInteractionAtByTabRef.current[tabId];
      delete rightInactiveWriteGuardByTabRef.current[tabId];
      delete leftTreeCacheRef.current[tabId];
      delete rightTreeCacheRef.current[tabId];
      foldLog('tab:closed', { tabId });
    }
  };

  const handleTabClick = (tabId: string) => {
    if (!tabId || tabId === activeTabIdRef.current) return;
    const fromTabId = activeTabIdRef.current;
    const saved = persistCurrentRightViewState('tab-click');
    if (saved && saved.tabId === fromTabId && saved.hiddenWeight > 0) {
      rightInactiveWriteGuardByTabRef.current[fromTabId] = {
        minWeight: saved.hiddenWeight,
        expiresAt: Date.now() + 2600,
      };
      foldLog('switch-guard:set', {
        tabId: fromTabId,
        reason: 'tab-click',
        minWeight: saved.hiddenWeight,
      });
    }
    foldLog('tab:switch', { fromTabId, toTabId: tabId, reason: 'tab-click' });
    activeTabIdRef.current = tabId;
    setActiveTabId(tabId);
  };

  const getMonacoOptions = (): monaco.editor.IStandaloneEditorConstructionOptions => ({
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    largeFileOptimizations: true,
    wordWrap: wrapLongLines ? 'on' : 'off',
    folding: true,
    showFoldingControls: 'always',
    foldingStrategy: 'indentation',
    foldingHighlight: true,
    unfoldOnClickAfterEndOfLine: false,
    glyphMargin: true,
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
    guides: { indentation: false },
  });

  const handleClear = () => {
    if (!activeTabId) return;

    const pendingTimer = formatTimerByTabRef.current[activeTabId];
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      delete formatTimerByTabRef.current[activeTabId];
    }

    updateTabContent(activeTabId, '');
    renameTab(activeTabId, 'newTab');

    leftTreeRef.current = undefined;
    rightTreeRef.current = undefined;
    leftTreeCacheRef.current[activeTabId] = { text: '', tree: undefined };
    rightTreeCacheRef.current[activeTabId] = { text: '', tree: undefined };
    delete rightViewStateByTabRef.current[activeTabId];
    delete rightFoldingStateByTabRef.current[activeTabId];
    delete rightHiddenAreasByTabRef.current[activeTabId];
    delete rightLastInteractionAtByTabRef.current[activeTabId];
    delete rightInactiveWriteGuardByTabRef.current[activeTabId];
    clearTabValue(activeTabId);

    setError(null);
    resetSearchState();
  };

  const handleFormat = () => {
    if (!activeTabId) return;

    const pendingTimer = formatTimerByTabRef.current[activeTabId];
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      delete formatTimerByTabRef.current[activeTabId];
    }

    const activeTab = getActiveTab();
    const text = leftEditorRef.current?.getValue() ?? activeTab?.content ?? '';

    leftTreeRef.current = text ? parseTree(text) : undefined;
    leftTreeCacheRef.current[activeTabId] = { text, tree: leftTreeRef.current };
    formatInWorker(text, activeTabId);
  };

  const handleImport = async () => {
    if (!window.electronAPI) {
      setError('当前运行环境不支持本地文件导入');
      return;
    }

    try {
      const filePath = await window.electronAPI.selectJsonFile();
      if (!filePath) return;

      const content = await window.electronAPI.readJsonFile(filePath);
      const fileName = extractFileName(filePath);
      const targetTabId = activeTabId || (() => {
        const id = addTab();
        ensureTabValue(id);
        return id;
      })();

      const pendingTimer = formatTimerByTabRef.current[targetTabId];
      if (pendingTimer !== undefined) {
        window.clearTimeout(pendingTimer);
        delete formatTimerByTabRef.current[targetTabId];
      }

      renameTab(targetTabId, fileName);
      updateTabContent(targetTabId, content);

      leftTreeRef.current = parseTree(content);
      leftTreeCacheRef.current[targetTabId] = { text: content, tree: leftTreeRef.current };
      formatInWorker(content, targetTabId);
      setError(null);
      setWorkerError(null);
      resetSearchState();
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      setError(`导入失败：${message}`);
    }
  };

  const handleOpenEditData = () => {
    if (!activeTabId) return;

    try {
      const raw = leftEditorRef.current?.getValue() ?? getActiveTab()?.content ?? '';
      const parsed = JSON.parse(raw);
      setEditingDataValue(formatJson(parsed));
      setIsEditingData(true);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      notifier.error(`打开 JSON 编辑失败：${message}`);
    }
  };

  const handleSaveEditData = () => {
    if (!activeTabId) return;

    try {
      const pendingTimer = formatTimerByTabRef.current[activeTabId];
      if (pendingTimer !== undefined) {
        window.clearTimeout(pendingTimer);
        delete formatTimerByTabRef.current[activeTabId];
      }

      const updated = formatJson(JSON.parse(editingDataValue));
      updateTabContent(activeTabId, updated);

      leftTreeRef.current = parseTree(updated);
      leftTreeCacheRef.current[activeTabId] = { text: updated, tree: leftTreeRef.current };
      formatInWorker(updated, activeTabId);
      setIsEditingData(false);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      setError(`保存 JSON 失败：${message}`);
    }
  };

  const handleCopyEscapedJson = () => {
    try {
      const escaped = toEscapedJsonLiteral(editingDataValue);
      navigator.clipboard
        .writeText(escaped)
        .then(() => {
          setHasCopied(true);
          setTimeout(() => setHasCopied(false), 2000);
        })
        .catch(() => {
          notifier.error('复制失败，请重试');
          setHasCopied(false);
        });
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      notifier.error(`复制转义字符串失败：${message}`);
    }
  };

  const onLeftMount: OnMount = (editor) => {
    leftEditorRef.current = editor;

    editor.onDidDispose(() => {
      if (leftEditorRef.current === editor) {
        leftEditorRef.current = null;
      }
    });

    // 全选后按 Delete/Backspace 触发“清除”逻辑，保持旧行为
    editor.addCommand(
      monaco.KeyCode.Delete,
      () => {
        const model = editor.getModel();
        const sel = editor.getSelection();
        if (!model || !sel) return;

        if (isWholeModelSelection(model, sel)) {
          const tabId = activeTabIdRef.current;
          if (!tabId) return;
          const pendingTimer = formatTimerByTabRef.current[tabId];
          if (pendingTimer !== undefined) {
            window.clearTimeout(pendingTimer);
            delete formatTimerByTabRef.current[tabId];
          }
          updateTabContent(tabId, '');
          renameTab(tabId, 'newTab');
          leftTreeRef.current = undefined;
          rightTreeRef.current = undefined;
          leftTreeCacheRef.current[tabId] = { text: '', tree: undefined };
          rightTreeCacheRef.current[tabId] = { text: '', tree: undefined };
          delete rightViewStateByTabRef.current[tabId];
          delete rightFoldingStateByTabRef.current[tabId];
          delete rightHiddenAreasByTabRef.current[tabId];
          delete rightLastInteractionAtByTabRef.current[tabId];
          delete rightInactiveWriteGuardByTabRef.current[tabId];
          clearTabValue(tabId);
          setError(null);
          resetSearchState();
          return;
        }

        editor.trigger('', 'deleteRight', null);
      },
      'editorTextFocus'
    );

    editor.addCommand(
      monaco.KeyCode.Backspace,
      () => {
        const model = editor.getModel();
        const sel = editor.getSelection();
        if (!model || !sel) return;

        if (isWholeModelSelection(model, sel)) {
          const tabId = activeTabIdRef.current;
          if (!tabId) return;
          const pendingTimer = formatTimerByTabRef.current[tabId];
          if (pendingTimer !== undefined) {
            window.clearTimeout(pendingTimer);
            delete formatTimerByTabRef.current[tabId];
          }
          updateTabContent(tabId, '');
          renameTab(tabId, 'newTab');
          leftTreeRef.current = undefined;
          rightTreeRef.current = undefined;
          leftTreeCacheRef.current[tabId] = { text: '', tree: undefined };
          rightTreeCacheRef.current[tabId] = { text: '', tree: undefined };
          delete rightViewStateByTabRef.current[tabId];
          delete rightFoldingStateByTabRef.current[tabId];
          delete rightHiddenAreasByTabRef.current[tabId];
          delete rightLastInteractionAtByTabRef.current[tabId];
          delete rightInactiveWriteGuardByTabRef.current[tabId];
          clearTabValue(tabId);
          setError(null);
          resetSearchState();
          return;
        }

        editor.trigger('', 'deleteLeft', null);
      },
      'editorTextFocus'
    );

    editor.addAction({
      id: 'custom.clipboardPasteAction',
      label: 'Custom Paste',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 1,
      run: async (ed) => {
        const text = await navigator.clipboard.readText();
        const model = ed.getModel();
        const sel = ed.getSelection();
        if (!model || !sel) return;

        if (sel.equalsRange(model.getFullModelRange())) {
          ed.setValue(text);
          return;
        }

        ed.executeEdits('paste', [
          {
            range: sel,
            text,
            forceMoveMarkers: true,
          },
        ]);
      },
    });
  };

  const onRightMount: OnMount = (editor) => {
    rightEditorRef.current = editor;
    const hiddenProbe = readEditorHiddenAreas(editor);
    const domNode = editor.getDomNode();
    const handlePointerDown = () => {
      const tabId = getRightModelTabId(editor) || activeTabIdRef.current;
      markRightInteraction(tabId);
      // 保障折叠图标点击等场景也能中断延迟恢复任务。
      cancelPendingRestoreForTab(tabId, 'pointer-down');
    };
    if (domNode) {
      domNode.addEventListener('pointerdown', handlePointerDown, true);
    }

    foldLog('right-mount', {
      hiddenSource: hiddenProbe.source,
      hasSetHiddenApi: typeof (editor as FoldAwareEditor).setHiddenAreas === 'function',
      hasFoldingContributionApi: Boolean(getFoldingContribution(editor)),
    });

    editor.onDidDispose(() => {
      if (domNode) {
        domNode.removeEventListener('pointerdown', handlePointerDown, true);
      }
      if (rightEditorRef.current === editor) {
        rightEditorRef.current = null;
      }
    });

    editor.onMouseDown(() => {
      const tabId = getRightModelTabId(editor) || activeTabIdRef.current;
      markRightInteraction(tabId);
    });

    editor.onKeyDown(() => {
      const tabId = getRightModelTabId(editor) || activeTabIdRef.current;
      markRightInteraction(tabId);
      // 键盘触发的折叠操作同样应优先于自动恢复重试。
      cancelPendingRestoreForTab(tabId, 'key-down');
    });

    // 折叠/展开变更时，实时记录当前 tab 的视图状态，确保跨 tab 切换可恢复。
    editor.onDidChangeHiddenAreas(() => {
      const tabId = getRightModelTabId(editor);
      if (!tabId) return;
      const hiddenRead = readEditorHiddenAreas(editor);
      const hiddenAreas = hiddenRead.areas;
      const currentWeight = getHiddenAreaWeight(hiddenAreas);

      if (isRightViewStateSyncRef.current) {
        foldLog('hiddenAreas:ignored-sync', {
          tabId,
          hiddenSource: hiddenRead.source,
          hiddenCount: hiddenAreas.length,
          hiddenWeight: currentWeight,
          activeTabId: activeTabIdRef.current,
        });
        return;
      }

      // 切换瞬间可能会收到“非当前激活 tab”的回调，这类回写会污染目标 tab 折叠状态。
      if (tabId !== activeTabIdRef.current) {
        foldLog('hiddenAreas:ignored-inactive-model', {
          tabId,
          activeTabId: activeTabIdRef.current,
          hiddenSource: hiddenRead.source,
          hiddenCount: hiddenAreas.length,
          hiddenWeight: currentWeight,
        });
        return;
      }

      const canUseHiddenAreas = hiddenRead.source !== 'none';
      const switchGuard = rightInactiveWriteGuardByTabRef.current[tabId];
      if (switchGuard) {
        if (Date.now() > switchGuard.expiresAt) {
          delete rightInactiveWriteGuardByTabRef.current[tabId];
          foldLog('switch-guard:expired', { tabId });
        } else if (canUseHiddenAreas && tabId !== activeTabIdRef.current && currentWeight < switchGuard.minWeight) {
          foldLog('hiddenAreas:ignored-switch-guard', {
            tabId,
            hiddenSource: hiddenRead.source,
            hiddenWeight: currentWeight,
            minWeight: switchGuard.minWeight,
            activeTabId: activeTabIdRef.current,
          });
          return;
        } else {
          delete rightInactiveWriteGuardByTabRef.current[tabId];
          foldLog('switch-guard:clear', {
            tabId,
            hiddenWeight: currentWeight,
            activeTabId: activeTabIdRef.current,
          });
        }
      }

      const guard = rightRestoreGuardRef.current;
      if (guard && guard.tabId === tabId && canUseHiddenAreas) {
        if (Date.now() > guard.expiresAt) {
          rightRestoreGuardRef.current = null;
          foldLog('restore-guard:expired', { tabId });
        } else {
          const expectedWeight = getHiddenAreaWeight(guard.expected);
          const lastInteractionAt = rightLastInteractionAtByTabRef.current[tabId] || 0;
          const interactionAgeMs = Date.now() - lastInteractionAt;
          const hasRecentInteraction = interactionAgeMs <= 1200;
          // 恢复窗口期间忽略“折叠总量变少”的回写，避免覆盖已缓存的折叠状态。
          if (expectedWeight > 0 && currentWeight < expectedWeight) {
            if (hasRecentInteraction) {
              // 如果用户刚刚有手动交互（例如点击展开），说明这是期望行为，释放保护并停止后续重试。
              rightRestoreGuardRef.current = null;
              clearRightRestoreTimers();
              foldLog('restore-guard:release-user-action', {
                tabId,
                hiddenSource: hiddenRead.source,
                hiddenWeight: currentWeight,
                expectedWeight,
                interactionAgeMs,
              });
            } else {
              foldLog('hiddenAreas:ignored-restore-guard', {
                tabId,
                hiddenSource: hiddenRead.source,
                hiddenWeight: currentWeight,
                expectedWeight,
              });
              return;
            }
          }
          if (rightRestoreGuardRef.current && areHiddenAreasEqual(hiddenAreas, guard.expected)) {
            rightRestoreGuardRef.current = null;
            foldLog('restore-guard:clear', {
              tabId,
              hiddenWeight: currentWeight,
            });
          }
        }
      }

      const state = editor.saveViewState();
      const foldingState = saveFoldingContributionState(editor);
      const collapsedRegionCount = getCollapsedRegionCount(foldingState);
      const keepPreviousFoldingState = shouldKeepPreviousFoldingState(
        tabId,
        collapsedRegionCount,
        hiddenAreas.length,
        'hiddenAreas'
      );
      rightViewStateByTabRef.current[tabId] = state;
      if (!keepPreviousFoldingState) {
        rightFoldingStateByTabRef.current[tabId] = foldingState;
      }
      if (canUseHiddenAreas && !keepPreviousFoldingState) {
        rightHiddenAreasByTabRef.current[tabId] = hiddenAreas;
      }
      foldLog('hiddenAreas:saved', {
        tabId,
        hiddenSource: hiddenRead.source,
        hiddenCount: hiddenAreas.length,
        hiddenWeight: currentWeight,
        collapsedRegionCount,
        keepPreviousFoldingState,
        activeTabId: activeTabIdRef.current,
      });
    });

    editor.onDidChangeModel(() => {
      const tabId = getRightModelTabId(editor);
      if (!tabId) return;
      restoreRightViewStateForTab(tabId, true);
    });

    const initTabId = getRightModelTabId(editor);
    if (initTabId) {
      restoreRightViewStateForTab(initTabId, true);
    }

    editor.onDidChangeCursorPosition((e) => {
      if (e.position.lineNumber === 1 && e.position.column === 1) return;

      const rightModel = editor.getModel();
      const leftModel = leftEditorRef.current?.getModel();
      if (!rightModel || !leftModel) return;

      const currentTabId = activeTabIdRef.current;
      const currentTab = tabsRef.current.find((tab) => tab.id === currentTabId);
      const currentLeftText = currentTab?.content || '';
      const currentRightText = rightValuesRef.current[currentTabId] || '';
      rightTreeRef.current = ensureRightTree(currentTabId, currentRightText);
      leftTreeRef.current = ensureLeftTree(currentTabId, currentLeftText);
      if (!rightTreeRef.current || !leftTreeRef.current) return;

      const offset = rightModel.getOffsetAt(e.position);
      const rightText = rightModel.getValue();
      const location = getLocation(rightText, offset);

      const rightNode = findNodeAtLocation(rightTreeRef.current, location.path);
      const leftNode = findNodeAtLocation(leftTreeRef.current, location.path);
      if (!rightNode || !leftNode) return;

      const startPos = leftModel.getPositionAt(leftNode.offset);
      const endPos = leftModel.getPositionAt(leftNode.offset + leftNode.length);

      const range = new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
      leftEditorRef.current?.revealRangeInCenter(range);
      leftEditorRef.current?.setSelection(
        new monaco.Selection(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column)
      );

      const ids = leftEditorRef.current?.deltaDecorations(leftDecsRef.current, [
        {
          range,
          options: { inlineClassName: 'currentSearchHighlight' },
        },
      ]);

      if (!ids) return;
      leftDecsRef.current = ids;
      setTimeout(() => {
        leftEditorRef.current?.deltaDecorations(ids, []);
        leftDecsRef.current = [];
      }, 1500);
    });

    editor.addAction({
      id: 'copyValueAction',
      label: '复制值',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: async (ed) => {
        const model = ed.getModel();
        const pos = ed.getPosition();
        if (!model || !pos || !rightTreeRef.current) return;

        const offset = model.getOffsetAt(pos);
        const text = model.getValue();
        const location = getLocation(text, offset);
        const node = findNodeAtLocation(rightTreeRef.current, location.path);
        if (!node) return;

        const toCopy =
          node.type === 'string' ? String(node.value ?? '') : text.slice(node.offset, node.offset + node.length);
        await navigator.clipboard.writeText(toCopy);
      },
    });
  };

  const applyRightSearchDecorations = (matches: monaco.editor.FindMatch[], activeIdx: number) => {
    const editor = rightEditorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;

    const ids = editor.deltaDecorations(
      rightDecsRef.current,
      matches.map((match, matchIdx) => ({
        range: match.range,
        options: {
          inlineClassName: matchIdx === activeIdx ? 'currentSearchHighlight' : 'searchHighlight',
        },
      }))
    );
    rightDecsRef.current = ids;

    if (!matches.length) return;

    const currentMatch = matches[activeIdx % matches.length];
    editor.revealRangeInCenter(currentMatch.range);

    const leftEditor = leftEditorRef.current;
    const leftModel = leftEditor?.getModel();
    if (!leftEditor || !leftModel) return;

    const snippet = model.getValueInRange(currentMatch.range);
    const leftMatch = leftModel.findNextMatch(snippet, new monaco.Position(1, 1), false, false, null, false);
    if (!leftMatch) return;

    leftEditor.revealRangeInCenter(leftMatch.range);
    leftEditor.setSelection(
      new monaco.Selection(
        leftMatch.range.startLineNumber,
        leftMatch.range.startColumn,
        leftMatch.range.endLineNumber,
        leftMatch.range.endColumn
      )
    );

    const leftIds = leftEditor.deltaDecorations(leftDecsRef.current, [
      {
        range: leftMatch.range,
        options: { inlineClassName: 'currentSearchHighlight' },
      },
    ]);

    leftDecsRef.current = leftIds;
    setTimeout(() => {
      leftEditor.deltaDecorations(leftIds, []);
      leftDecsRef.current = [];
    }, 1500);
  };

  const runRightSearch = (term: string) => {
    const editor = rightEditorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;

    const matches = term ? model.findMatches(term, true, true, false, null, true) : [];
    rightMatchesRef.current = matches;
    setRightMatches(matches);
    applyRightSearchDecorations(matches, currentIdx);
  };

  const handlePrevMatch = () => {
    if (!rightMatches.length) return;
    setCurrentIdx((idx) => (idx - 1 + rightMatches.length) % rightMatches.length);
  };

  const handleNextMatch = () => {
    if (!rightMatches.length) return;
    setCurrentIdx((idx) => (idx + 1) % rightMatches.length);
  };

  const handleSearchTermChange = (value: string) => {
    setSearchTerm(value);
    setCurrentIdx(0);
  };

  const handleToggleWrap = useCallback(() => {
    setWrapLongLines((prev) => !prev);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  const handleRenamingChange = useCallback((next: { id: string; value: string }) => {
    setRenamingTab(next);
  }, [setRenamingTab]);

  const handleLeftValueChange = (tabId: string, text: string) => {
    updateTabContent(tabId, text);

    const pendingTimer = formatTimerByTabRef.current[tabId];
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
    }

    // 输入阶段使用短防抖，减少每次按键都触发格式化造成的卡顿。
    formatTimerByTabRef.current[tabId] = window.setTimeout(() => {
      formatInWorker(text, tabId);
      delete formatTimerByTabRef.current[tabId];
    }, 120);

    // 仅为当前激活标签做轻量延迟解析，减少每次按键都 parseTree 的卡顿。
    if (tabId === activeTabIdRef.current) {
      if (leftParseTimerRef.current !== null) {
        window.clearTimeout(leftParseTimerRef.current);
      }

      leftParseTimerRef.current = window.setTimeout(() => {
        if (tabId !== activeTabIdRef.current) return;
        leftTreeRef.current = ensureLeftTree(tabId, text);
      }, 120);
    }
  };

  useEffect(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = window.setTimeout(() => {
      runRightSearch(searchTerm);
    }, 90);
  }, [searchTerm, activeTabId]);

  useEffect(() => {
    if (!activeTabId) return;
    const prevTabId = lastActiveTabIdForRightTextRef.current;
    lastActiveTabIdForRightTextRef.current = activeTabId;
    if (prevTabId !== activeTabId) return;
    // 文本刷新后做一次轻量恢复，避免重复重试造成卡顿。
    restoreRightViewStateForTab(activeTabId, false);
  }, [activeTabId, activeRightText]);

  useEffect(() => {
    applyRightSearchDecorations(rightMatchesRef.current, currentIdx);
  }, [currentIdx]);

  const handleFoldAll = () => {
    markRightInteraction(activeTabIdRef.current);
    rightEditorRef.current?.getAction('editor.foldAll')?.run();
  };

  const handleUnfoldAll = () => {
    markRightInteraction(activeTabIdRef.current);
    rightEditorRef.current?.getAction('editor.unfoldAll')?.run();
  };

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
      <Toaster position="top-right" gutter={8} />

      <Toolbar
        onImport={handleImport}
        onFormat={handleFormat}
        onClear={handleClear}
        onFoldAll={handleFoldAll}
        onUnfoldAll={handleUnfoldAll}
        onOpenEditData={handleOpenEditData}
        searchTerm={searchTerm}
        onSearchTermChange={handleSearchTermChange}
        rightMatches={rightMatches}
        onPrevMatch={handlePrevMatch}
        onNextMatch={handleNextMatch}
        wrapLongLines={wrapLongLines}
        onToggleWrap={handleToggleWrap}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        error={displayError}
      />

      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        renamingTab={renamingTab}
        onTabClick={handleTabClick}
        onTabClose={handleCloseTab}
        onStartRename={startRenaming}
        onRenamingChange={handleRenamingChange}
        onFinishRename={finishRenaming}
        onCancelRename={cancelRenaming}
        onAddTab={handleAddTab}
      />

      <JsonSplitView
        tabs={tabs}
        activeTabId={activeTabId}
        isDarkMode={isDarkMode}
        rightValues={rightValues}
        splitSizes={splitSizes}
        onSplitDragEnd={setSplitSizes}
        getMonacoOptions={getMonacoOptions}
        onLeftMount={onLeftMount}
        onRightMount={onRightMount}
        onLeftValueChange={handleLeftValueChange}
      />

      {isEditingData && (
        <EditJsonModal
          activeTabId={activeTabId}
          isDarkMode={isDarkMode}
          editingDataValue={editingDataValue}
          hasCopied={hasCopied}
          onChange={setEditingDataValue}
          onSave={handleSaveEditData}
          onCopyEscaped={handleCopyEscapedJson}
          onClose={() => setIsEditingData(false)}
        />
      )}
    </div>
  );
};

export default App;
