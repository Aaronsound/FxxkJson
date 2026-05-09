import React, { useEffect, useRef, useState } from 'react';
import Split from 'react-split';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import JsonEditModal from './components/JsonEditModal';
import LargeJsonReadonlyViewer, { LargeJsonReadonlyViewerHandle } from './components/LargeJsonReadonlyViewer';
import JsonPerformancePanel from './components/JsonPerformancePanel';
import JsonToolTabBar from './components/JsonToolTabBar';
import JsonToolToolbar from './components/JsonToolToolbar';
import PaneFindWidget from './components/PaneFindWidget';
import { useJsonFormattingWorker } from './hooks/useJsonFormattingWorker';
import { useJsonPerformanceTracking } from './hooks/useJsonPerformanceTracking';
import { useJsonToolTabsState } from './hooks/useJsonToolTabsState';
import {
  DEFAULT_TAB_TITLE,
  DEFAULT_SEARCH_OPTIONS,
  EMPTY_DOCUMENT_META,
  INITIAL_TAB_ID,
  LARGE_FILE_THRESHOLD,
  LargeJsonSearchMatch,
  LargeJsonViewerData,
  SEARCH_BATCH_SIZE,
  SEARCH_HIGHLIGHT_DURATION,
  StructureStatus,
  STRUCTURE_SYNC_THRESHOLD,
} from './types/jsonTool';
import type { JsonSearchOptions } from './types/jsonTool';
import {
  createTab,
  getEditorLanguageByLength,
  getLeftModelPath,
  getOrCreateModel,
  getRightModelPath,
  getUtf8ByteLength,
  isLargeDocument,
  recreateModel,
  selectionCoversModel,
  shouldUseLargeMode,
} from './utils/jsonToolModels';
import {
  buildLineStarts,
  findTextSearchBatch,
} from './utils/searchText';
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

function getMonacoSearchBatch(
  model: monaco.editor.ITextModel,
  searchTerm: string,
  searchOptions: JsonSearchOptions,
  startOffset = 0,
  maxResults = SEARCH_BATCH_SIZE
) {
  const text = model.getValue();
  const result = findTextSearchBatch(
    text,
    buildLineStarts(text),
    model.getLineCount(),
    searchTerm,
    searchOptions,
    startOffset,
    maxResults
  );

  return {
    ...result,
    ranges: result.matches.map((match) => {
      const start = model.getPositionAt(match.start);
      const end = model.getPositionAt(match.end);
      return new monaco.Range(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column
      );
    }),
  };
}

function getReplacementText(
  model: monaco.editor.ITextModel,
  range: monaco.Range,
  searchTerm: string,
  searchOptions: JsonSearchOptions,
  replaceText: string
) {
  if (!searchOptions.useRegex) {
    return replaceText;
  }

  try {
    const source = model.getValueInRange(range);
    return source.replace(
      new RegExp(searchTerm, searchOptions.matchCase ? '' : 'i'),
      replaceText
    );
  } catch {
    return replaceText;
  }
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
  const [leftSearchTerm, setLeftSearchTerm] = useState('');
  const [rightSearchTerm, setRightSearchTerm] = useState('');
  const [leftSearchOptions, setLeftSearchOptions] = useState<JsonSearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [rightSearchOptions, setRightSearchOptions] = useState<JsonSearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [leftReplaceText, setLeftReplaceText] = useState('');
  const [leftMatches, setLeftMatches] = useState<monaco.Range[]>([]);
  const [rightMatches, setRightMatches] = useState<monaco.Range[]>([]);
  const [largeViewerMatchCount, setLargeViewerMatchCount] = useState(0);
  const [largeViewerMatches, setLargeViewerMatches] = useState<LargeJsonSearchMatch[]>([]);
  const [leftSearchHasMore, setLeftSearchHasMore] = useState(false);
  const [rightSearchHasMore, setRightSearchHasMore] = useState(false);
  const [leftSearchNextOffset, setLeftSearchNextOffset] = useState(0);
  const [rightSearchNextOffset, setRightSearchNextOffset] = useState(0);
  const [isRightSearchLoadingMore, setIsRightSearchLoadingMore] = useState(false);
  const [leftMatchIndex, setLeftMatchIndex] = useState(0);
  const [rightMatchIndex, setRightMatchIndex] = useState(0);
  const [isLeftFindOpen, setIsLeftFindOpen] = useState(false);
  const [isRightFindOpen, setIsRightFindOpen] = useState(false);
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
  const [largeViewerDataByTab, setLargeViewerDataByTab] = useState<Record<string, LargeJsonViewerData | null>>({
    [INITIAL_TAB_ID]: null,
  });
  const [largeViewerStatusByTab, setLargeViewerStatusByTab] = useState<Record<string, 'idle' | 'building' | 'ready'>>({
    [INITIAL_TAB_ID]: 'idle',
  });
  const [largeViewerCollapsedLinesByTab, setLargeViewerCollapsedLinesByTab] = useState<Record<string, number[]>>({
    [INITIAL_TAB_ID]: [],
  });

  const leftEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const rightEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const largeViewerRef = useRef<LargeJsonReadonlyViewerHandle | null>(null);
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
    ? activeDocumentMeta.rawLength > 0
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
  const activeLargeViewerData = activeTab
    ? largeViewerDataByTab[activeTab.id] ?? null
    : null;
  const activeLargeViewerStatus = activeTab
    ? largeViewerStatusByTab[activeTab.id] ?? 'idle'
    : 'idle';
  const activeLargeViewerCollapsedLines = activeTab
    ? largeViewerCollapsedLinesByTab[activeTab.id] ?? []
    : [];
  const shouldUseDedicatedRightViewer = Boolean(activeLargeViewerData && formattedValue);
  const isBuildingDedicatedRightViewer = Boolean(
    formattedValue
    && !shouldUseDedicatedRightViewer
    && activeLargeViewerStatus === 'building'
  );
  const canControlRightPaneFolding = Boolean(
    formattedValue
    && !isBuildingDedicatedRightViewer
    && (canUseRightPaneFolding || shouldUseDedicatedRightViewer)
  );
  const activeRightMatchCount = shouldUseDedicatedRightViewer
    ? largeViewerMatchCount
    : rightMatches.length;
  const activeLeftMatchCount = leftMatches.length;
  const normalizedLeftMatchIndex = activeLeftMatchCount > 0
    ? ((leftMatchIndex % activeLeftMatchCount) + activeLeftMatchCount) % activeLeftMatchCount
    : 0;
  const normalizedRightMatchIndex = activeRightMatchCount > 0
    ? ((rightMatchIndex % activeRightMatchCount) + activeRightMatchCount) % activeRightMatchCount
    : 0;
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

  const copyValueAtOffset = async (tabId: string, offset: number, preferCachedText = false) => {
    const valueToCopy = await requestWorkerValue(tabId, offset, preferCachedText);
    if (valueToCopy === null) {
      return;
    }

    await navigator.clipboard.writeText(valueToCopy);
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
    setLeftSearchTerm('');
    setRightSearchTerm('');
    setLeftReplaceText('');
    setLeftMatches([]);
    setRightMatches([]);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    setLeftSearchHasMore(false);
    setRightSearchHasMore(false);
    setLeftSearchNextOffset(0);
    setRightSearchNextOffset(0);
    setIsRightSearchLoadingMore(false);
    setLeftMatchIndex(0);
    setRightMatchIndex(0);
    setIsLeftFindOpen(false);
    setIsRightFindOpen(false);
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

  const setLargeViewerData = (tabId: string, data: LargeJsonViewerData | null) => {
    setLargeViewerDataByTab((current) => ({ ...current, [tabId]: data }));
    setLargeViewerCollapsedLinesByTab((current) => ({ ...current, [tabId]: [] }));
    if (tabId === activeTabIdRef.current) {
      setLargeViewerMatches([]);
      setLargeViewerMatchCount(0);
      setRightSearchHasMore(false);
      setRightSearchNextOffset(0);
      setIsRightSearchLoadingMore(false);
    }
  };

  const setLargeViewerStatus = (tabId: string, status: 'idle' | 'building' | 'ready') => {
    setLargeViewerStatusByTab((current) => ({ ...current, [tabId]: status }));
  };

  const setLargeViewerSearchResults = (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore = false,
    nextStartOffset = 0,
    append = false
  ) => {
    if (tabId !== activeTabIdRef.current) {
      return;
    }

    const nextMatches = append ? [...largeViewerMatches, ...matches] : matches;
    setLargeViewerMatches(nextMatches);
    setLargeViewerMatchCount(nextMatches.length);
    setRightSearchHasMore(hasMore);
    setRightSearchNextOffset(nextStartOffset);
    setIsRightSearchLoadingMore(false);
  };

  const getTabContent = (tabId: string) => rawTextByTabRef.current[tabId] ?? '';

  const updateTabContent = (tabId: string, content: string, syncModel = false) => {
    const byteLength = getUtf8ByteLength(content);
    rawTextByTabRef.current[tabId] = content;
    setDocumentMeta(tabId, (current) => ({
      ...current,
      rawLength: byteLength,
      rawRevision: current.rawRevision + 1,
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
    const shouldPreferDedicatedViewer = Boolean(largeViewerDataByTab[tabId])
      || largeViewerStatusByTab[tabId] === 'building';

    if (shouldPreferDedicatedViewer) {
      const existingModel = monaco.editor.getModel(monaco.Uri.parse(path));
      if (existingModel) {
        if (rightEditorRef.current?.getModel() === existingModel) {
          rightEditorRef.current.setModel(null);
        }
        existingModel.dispose();
      }
      return;
    }

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
    requestWorkerSearch,
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
    setLargeViewerData,
    setLargeViewerStatus,
    setLargeViewerSearchResults,
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
  }, [
    activeLargeViewerData,
    activeLargeViewerStatus,
    activeTab,
    activeDocumentMeta.formattedLength,
    activeDocumentMeta.rawLength,
  ]);

  useEffect(() => {
    leftEditorRef.current?.updateOptions(getMonacoOptions(isLargeFileMode));
    leftEditorRef.current?.layout();
    if (!shouldUseDedicatedRightViewer && !isBuildingDedicatedRightViewer) {
      rightEditorRef.current?.updateOptions(
        getMonacoOptions(isLargeFileMode, true, shouldEnableRightPaneFolding)
      );
      rightEditorRef.current?.layout();
    }
    if (activeTab && !shouldUseDedicatedRightViewer) {
      logRightEditorState(activeTab.id === activeTabId ? 'right-editor-options-refreshed' : 'right-editor-options-skipped', activeTab.id, {
        isLargeFileMode,
        shouldEnableRightPaneFolding,
        wrapLongLines,
      });
    }
  }, [
    activeTab,
    activeTabId,
    isBuildingDedicatedRightViewer,
    isLargeFileMode,
    shouldEnableRightPaneFolding,
    shouldUseDedicatedRightViewer,
    wrapLongLines,
  ]);

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
    if (!activeTab || !shouldUseDedicatedRightViewer) {
      setLargeViewerMatches([]);
      setLargeViewerMatchCount(0);
      setRightSearchHasMore(false);
      setRightSearchNextOffset(0);
      setIsRightSearchLoadingMore(false);
      return;
    }

    if (!rightSearchTerm) {
      setLargeViewerMatches([]);
      setLargeViewerMatchCount(0);
      setRightSearchHasMore(false);
      setRightSearchNextOffset(0);
      setIsRightSearchLoadingMore(false);
      return;
    }

    setIsRightSearchLoadingMore(false);
    requestWorkerSearch(activeTab.id, rightSearchTerm, rightSearchOptions, 0, false);
  }, [
    activeDocumentMeta.formattedRevision,
    activeLargeViewerData,
    activeTab,
    rightSearchOptions,
    rightSearchTerm,
    shouldUseDedicatedRightViewer,
  ]);

  useEffect(() => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || !leftSearchTerm) {
      setLeftMatches([]);
      setLeftSearchHasMore(false);
      setLeftSearchNextOffset(0);
      clearLeftHighlights();
      return;
    }

    const result = getMonacoSearchBatch(model, leftSearchTerm, leftSearchOptions);
    const matches = result.ranges;
    setLeftMatches(matches);
    setLeftSearchHasMore(result.hasMore);
    setLeftSearchNextOffset(result.nextStartOffset);

    const activeIndex = matches.length > 0
      ? ((leftMatchIndex % matches.length) + matches.length) % matches.length
      : 0;
    const nextDecorations = matches.map((range, index) => ({
      range,
      options: {
        inlineClassName:
          index === activeIndex ? 'currentSearchHighlight' : 'searchHighlight',
      },
    }));

    leftDecorationIdsRef.current = editor.deltaDecorations(
      leftDecorationIdsRef.current,
      nextDecorations
    );

    if (matches.length === 0) {
      return;
    }

    const activeMatch = matches[activeIndex];
    editor.revealRangeInCenter(activeMatch);
    editor.setSelection(
      new monaco.Selection(
        activeMatch.startLineNumber,
        activeMatch.startColumn,
        activeMatch.endLineNumber,
        activeMatch.endColumn
      )
    );
  }, [
    activeTabId,
    activeDocumentMeta.rawRevision,
    leftMatchIndex,
    leftSearchOptions,
    leftSearchTerm,
  ]);

  useEffect(() => {
    const editor = rightEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || !rightSearchTerm || shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer) {
      setRightMatches([]);
      if (!shouldUseDedicatedRightViewer) {
        setRightSearchHasMore(false);
        setRightSearchNextOffset(0);
        setIsRightSearchLoadingMore(false);
      }
      clearRightHighlights();
      return;
    }

    const result = getMonacoSearchBatch(model, rightSearchTerm, rightSearchOptions);
    const matches = result.ranges;
    setRightMatches(matches);
    setRightSearchHasMore(result.hasMore);
    setRightSearchNextOffset(result.nextStartOffset);
    setIsRightSearchLoadingMore(false);
    const activeIndex = matches.length > 0
      ? ((rightMatchIndex % matches.length) + matches.length) % matches.length
      : 0;

    const nextDecorations = matches.map((range, index) => ({
      range,
      options: {
        inlineClassName:
          index === activeIndex ? 'currentSearchHighlight' : 'searchHighlight',
      },
    }));

    rightDecorationIdsRef.current = editor.deltaDecorations(
      rightDecorationIdsRef.current,
      nextDecorations
    );

    if (matches.length === 0) {
      return;
    }

    const activeMatch = matches[activeIndex];
    editor.revealRangeInCenter(activeMatch);
    editor.setSelection(
      new monaco.Selection(
        activeMatch.startLineNumber,
        activeMatch.startColumn,
        activeMatch.endLineNumber,
        activeMatch.endColumn
      )
    );
  }, [
    activeTabId,
    activeDocumentMeta.formattedRevision,
    isBuildingDedicatedRightViewer,
    rightMatchIndex,
    rightSearchOptions,
    rightSearchTerm,
    shouldUseDedicatedRightViewer,
  ]);

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
      glyphMargin: false,
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      renderWhitespace: 'none',
      renderValidationDecorations: 'off',
      matchBrackets: 'never',
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 12,
      fontWeight: 'normal',
      lineHeight: 18,
      fontLigatures: false,
      letterSpacing: 0,
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

  const beginPastePerformanceSession = (tabId: string, nextContent: string) => {
    beginPerformanceSession(
      tabId,
      'paste',
      '剪贴板粘贴',
      null,
      getUtf8ByteLength(nextContent),
      shouldUseLargeMode(nextContent)
    );
  };

  const getContentAfterSelectionReplace = (
    model: monaco.editor.ITextModel,
    selection: monaco.Selection,
    text: string
  ) => {
    const startOffset = model.getOffsetAt(selection.getStartPosition());
    const endOffset = model.getOffsetAt(selection.getEndPosition());
    const currentText = model.getValue();
    return `${currentText.slice(0, startOffset)}${text}${currentText.slice(endOffset)}`;
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
      id: 'openLeftPaneFind',
      label: '搜索原始 JSON',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
      run: () => {
        openLeftFind();
      },
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
        const model = mountedEditor.getModel();

        if (!selection || !currentTabId || !model) {
          return;
        }

        const coversModel = selectionCoversModel(editor);
        const nextContent = coversModel
          ? text
          : getContentAfterSelectionReplace(model, selection, text);
        beginPastePerformanceSession(currentTabId, nextContent);

        if (coversModel) {
          const largeMode = shouldUseLargeMode(text);

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
      id: 'openRightPaneFind',
      label: '搜索格式化结果',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
      run: () => {
        openRightFind();
      },
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
        await copyValueAtOffset(currentTabId, offset);
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
    setLargeViewerDataByTab((current) => ({ ...current, [nextId]: null }));
    setLargeViewerStatusByTab((current) => ({ ...current, [nextId]: 'idle' }));
    setLargeViewerCollapsedLinesByTab((current) => ({ ...current, [nextId]: [] }));
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
    setLargeViewerDataByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setLargeViewerStatusByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setLargeViewerCollapsedLinesByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    if (activeTabId === tabId) {
      setActiveTabId(fallbackTab.id);
    }
  };

  const openLeftFind = () => {
    setIsLeftFindOpen(true);
  };

  const openRightFind = () => {
    setIsRightFindOpen(true);
  };

  const closeLeftFind = () => {
    setIsLeftFindOpen(false);
    setLeftSearchTerm('');
    setLeftMatches([]);
    setLeftSearchHasMore(false);
    setLeftSearchNextOffset(0);
    setLeftMatchIndex(0);
    clearLeftHighlights();
    leftEditorRef.current?.focus();
  };

  const closeRightFind = () => {
    setIsRightFindOpen(false);
    setRightSearchTerm('');
    setRightMatches([]);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    setRightSearchHasMore(false);
    setRightSearchNextOffset(0);
    setIsRightSearchLoadingMore(false);
    setRightMatchIndex(0);
    clearRightHighlights();
    if (shouldUseDedicatedRightViewer) {
      largeViewerRef.current?.focus();
    } else {
      rightEditorRef.current?.focus();
    }
  };

  const handleLeftSearchOptionsChange = (value: JsonSearchOptions) => {
    setLeftSearchOptions(value);
    setLeftSearchHasMore(false);
    setLeftSearchNextOffset(0);
    setLeftMatchIndex(0);
  };

  const handleRightSearchOptionsChange = (value: JsonSearchOptions) => {
    setRightSearchOptions(value);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    setRightSearchHasMore(false);
    setRightSearchNextOffset(0);
    setIsRightSearchLoadingMore(false);
    setRightMatchIndex(0);
  };

  const replaceLeftMatch = () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const range = leftMatches[normalizedLeftMatchIndex];

    if (!editor || !model || !range) {
      return;
    }

    editor.executeEdits('pane-find-replace', [{
      range,
      text: getReplacementText(
        model,
        range,
        leftSearchTerm,
        leftSearchOptions,
        leftReplaceText
      ),
      forceMoveMarkers: true,
    }]);
    editor.focus();
  };

  const replaceAllLeftMatches = () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || leftMatches.length === 0) {
      return;
    }

    const sortedRanges = [...leftMatches].sort((left, right) => (
      model.getOffsetAt({
        lineNumber: right.startLineNumber,
        column: right.startColumn,
      }) - model.getOffsetAt({
        lineNumber: left.startLineNumber,
        column: left.startColumn,
      })
    ));

    editor.executeEdits(
      'pane-find-replace-all',
      sortedRanges.map((range) => ({
        range,
        text: getReplacementText(
          model,
          range,
          leftSearchTerm,
          leftSearchOptions,
          leftReplaceText
        ),
        forceMoveMarkers: true,
      }))
    );
    setLeftMatchIndex(0);
    editor.focus();
  };

  const gotoNextLeft = () => {
    if (activeLeftMatchCount === 0) {
      return;
    }

    setLeftMatchIndex((current) => (current + 1) % activeLeftMatchCount);
  };

  const gotoPrevLeft = () => {
    if (activeLeftMatchCount === 0) {
      return;
    }

    setLeftMatchIndex((current) => (current - 1 + activeLeftMatchCount) % activeLeftMatchCount);
  };

  const gotoNextRight = () => {
    if (activeRightMatchCount === 0) {
      return;
    }

    setRightMatchIndex((current) => (current + 1) % activeRightMatchCount);
  };

  const gotoPrevRight = () => {
    if (activeRightMatchCount === 0) {
      return;
    }

    setRightMatchIndex((current) => (current - 1 + activeRightMatchCount) % activeRightMatchCount);
  };

  const loadMoreLeftSearch = () => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || !leftSearchTerm || !leftSearchHasMore) {
      return;
    }

    const result = getMonacoSearchBatch(
      model,
      leftSearchTerm,
      leftSearchOptions,
      leftSearchNextOffset
    );
    const nextMatches = [...leftMatches, ...result.ranges];
    const activeIndex = nextMatches.length > 0
      ? ((leftMatchIndex % nextMatches.length) + nextMatches.length) % nextMatches.length
      : 0;

    setLeftMatches(nextMatches);
    setLeftSearchHasMore(result.hasMore);
    setLeftSearchNextOffset(result.nextStartOffset);
    leftDecorationIdsRef.current = editor.deltaDecorations(
      leftDecorationIdsRef.current,
      nextMatches.map((range, index) => ({
        range,
        options: {
          inlineClassName:
            index === activeIndex ? 'currentSearchHighlight' : 'searchHighlight',
        },
      }))
    );
  };

  const loadMoreRightSearch = () => {
    if (!rightSearchTerm || !rightSearchHasMore || isRightSearchLoadingMore) {
      return;
    }

    if (shouldUseDedicatedRightViewer) {
      if (!activeTab) {
        return;
      }

      setIsRightSearchLoadingMore(true);
      requestWorkerSearch(
        activeTab.id,
        rightSearchTerm,
        rightSearchOptions,
        rightSearchNextOffset,
        true
      );
      return;
    }

    const editor = rightEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || isBuildingDedicatedRightViewer) {
      return;
    }

    const result = getMonacoSearchBatch(
      model,
      rightSearchTerm,
      rightSearchOptions,
      rightSearchNextOffset
    );
    const nextMatches = [...rightMatches, ...result.ranges];
    const activeIndex = nextMatches.length > 0
      ? ((rightMatchIndex % nextMatches.length) + nextMatches.length) % nextMatches.length
      : 0;

    setRightMatches(nextMatches);
    setRightSearchHasMore(result.hasMore);
    setRightSearchNextOffset(result.nextStartOffset);
    rightDecorationIdsRef.current = editor.deltaDecorations(
      rightDecorationIdsRef.current,
      nextMatches.map((range, index) => ({
        range,
        options: {
          inlineClassName:
            index === activeIndex ? 'currentSearchHighlight' : 'searchHighlight',
        },
      }))
    );
  };

  const handleLeftSearchTermChange = (value: string) => {
    setLeftSearchTerm(value);
    setLeftSearchHasMore(false);
    setLeftSearchNextOffset(0);
    setLeftMatchIndex(0);
  };

  const handleRightSearchTermChange = (value: string) => {
    setRightSearchTerm(value);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    setRightSearchHasMore(false);
    setRightSearchNextOffset(0);
    setIsRightSearchLoadingMore(false);
    setRightMatchIndex(0);
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
        onFoldAll={() => {
          if (shouldUseDedicatedRightViewer) {
            largeViewerRef.current?.foldAll();
            return;
          }
          rightEditorRef.current?.getAction('editor.foldAll')?.run();
        }}
        onUnfoldAll={() => {
          if (shouldUseDedicatedRightViewer) {
            largeViewerRef.current?.unfoldAll();
            return;
          }
          rightEditorRef.current?.getAction('editor.unfoldAll')?.run();
        }}
        canControlRightPaneFolding={canControlRightPaneFolding}
        isLargeFileMode={isLargeFileMode}
        canEditJson={canEditJson}
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
            {isLeftFindOpen && (
              <PaneFindWidget
                value={leftSearchTerm}
                currentIndex={activeLeftMatchCount > 0 ? normalizedLeftMatchIndex + 1 : 0}
                matchCount={activeLeftMatchCount}
                hasMore={leftSearchHasMore}
                isDarkMode={isDarkMode}
                placeholder="搜索原始 JSON"
                searchOptions={leftSearchOptions}
                canReplace
                replaceValue={leftReplaceText}
                onChange={handleLeftSearchTermChange}
                onSearchOptionsChange={handleLeftSearchOptionsChange}
                onReplaceValueChange={setLeftReplaceText}
                onReplace={replaceLeftMatch}
                onReplaceAll={replaceAllLeftMatches}
                onLoadMore={loadMoreLeftSearch}
                onPrev={gotoPrevLeft}
                onNext={gotoNextLeft}
                onClose={closeLeftFind}
              />
            )}
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
            <div className="editor-pane-header-flags">
              <span className={`editor-pane-header-flag ${shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer ? 'visible' : ''}`}>
                大文件查看模式
              </span>
              <span className={`editor-pane-header-flag ${isLargeFileMode ? 'visible' : ''}`}>
                轻量模式
              </span>
            </div>
          </div>
          <div className="editor-pane-body">
            {isRightFindOpen && (
              <PaneFindWidget
                value={rightSearchTerm}
                currentIndex={activeRightMatchCount > 0 ? normalizedRightMatchIndex + 1 : 0}
                matchCount={activeRightMatchCount}
                hasMore={rightSearchHasMore}
                isLoadingMore={isRightSearchLoadingMore}
                isDarkMode={isDarkMode}
                placeholder="搜索格式化结果"
                searchOptions={rightSearchOptions}
                onChange={handleRightSearchTermChange}
                onSearchOptionsChange={handleRightSearchOptionsChange}
                onLoadMore={loadMoreRightSearch}
                onPrev={gotoPrevRight}
                onNext={gotoNextRight}
                onClose={closeRightFind}
              />
            )}
            {shouldUseDedicatedRightViewer ? (
              <LargeJsonReadonlyViewer
                ref={largeViewerRef}
                text={formattedValue}
                data={activeLargeViewerData!}
                isDarkMode={isDarkMode}
                wrapLongLines={wrapLongLines}
                collapsedLines={activeLargeViewerCollapsedLines}
                searchTerm={rightSearchTerm}
                searchOptions={rightSearchOptions}
                searchMatches={largeViewerMatches}
                activeMatchIndex={rightMatchIndex}
                onCollapsedLinesChange={(lines) => {
                  if (!activeTab) {
                    return;
                  }

                  setLargeViewerCollapsedLinesByTab((current) => ({
                    ...current,
                    [activeTab.id]: lines,
                  }));
                }}
                onMatchCountChange={setLargeViewerMatchCount}
                onLocateOffset={(offset) => requestWorkerLocate(activeTab.id, offset)}
                onCopyValue={(offset) => copyValueAtOffset(activeTab.id, offset, true)}
                onOpenFind={openRightFind}
              />
            ) : !isBuildingDedicatedRightViewer ? (
              <Editor
                onMount={handleRightMount}
                theme={isDarkMode ? 'vs-dark' : 'vs-light'}
                options={getMonacoOptions(isLargeFileMode, true, shouldEnableRightPaneFolding)}
                height="100%"
                loading={null}
              />
            ) : null}
            {!formattedValue && !isImportingActiveTab && !isBuildingDedicatedRightViewer && (
              <div className="editor-center-placeholder">
                {isFormattingActiveTab ? '正在格式化...' : '格式化结果'}
              </div>
            )}
            {isBuildingDedicatedRightViewer && !isImportingActiveTab && (
              <div className="editor-loading-overlay">正在构建大文件查看模式...</div>
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
