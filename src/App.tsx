import React, { useEffect, useRef, useState } from 'react';
import { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import JsonEditModal from './components/JsonEditModal';
import type { LargeJsonReadonlyViewerHandle } from './components/LargeJsonReadonlyViewer';
import type { LargeRawReadonlyViewerHandle } from './components/LargeRawReadonlyViewer';
import DiagnosticsLogPanel from './components/DiagnosticsLogPanel';
import type { DiagnosticsContextItem } from './components/DiagnosticsLogPanel';
import JsonEditorPanes from './components/JsonEditorPanes';
import JsonPerformancePanel from './components/JsonPerformancePanel';
import JsonToolTabBar from './components/JsonToolTabBar';
import JsonToolToolbar from './components/JsonToolToolbar';
import { useJsonEditSession } from './hooks/useJsonEditSession';
import { useJsonFormattingWorker } from './hooks/useJsonFormattingWorker';
import { useJsonPerformanceTracking } from './hooks/useJsonPerformanceTracking';
import { useRightNodeSelectionHighlight } from './hooks/useRightNodeSelectionHighlight';
import { useJsonToolTabsState } from './hooks/useJsonToolTabsState';
import { useJsonTabArtifacts } from './hooks/useJsonTabArtifacts';
import { usePaneSearchState } from './hooks/usePaneSearchState';
import {
  DEFAULT_TAB_TITLE,
  EMPTY_DOCUMENT_META,
  INITIAL_TAB_ID,
  LARGE_FILE_THRESHOLD,
  LargeJsonSearchMatch,
  LocateFeedback,
  ProcessingStage,
  SEARCH_HIGHLIGHT_DURATION,
  StructureStatus,
  STRUCTURE_SYNC_THRESHOLD,
} from './types/jsonTool';
import type {
  EditJsonWorkerOperation,
  JsonEditPath,
  JsonSearchOptions,
  LargeJsonViewerData,
  LargeRawViewerData,
  RightNodeSelection,
} from './types/jsonTool';
import {
  createTab,
  getEditorLanguageByLength,
  getLeftModelPath,
  getOrCreateModel,
  getRightModelPath,
  disposeModel,
  recreateModel,
  selectionCoversModel,
} from './utils/jsonToolModels';
import {
  bindEditorFocusContext,
  getContentAfterSelectionReplace,
  registerPaneFindAction,
  registerSelectAllDeleteCommands,
} from './utils/jsonEditorMountActions';
import {
  getUtf8ByteLength,
  isLargeDocument,
  shouldUseLargeMode,
} from './utils/jsonDocumentMetrics';
import {
  formatBytes,
  formatDuration,
  getMonacoOptions,
  getMonacoSearchBatch,
  getReplacementText,
} from './utils/jsonEditorInteractions';
import { getFirstJsonImportFile } from './utils/importFiles';
import { getProcessingStageText } from './utils/jsonProcessingStage';
import { getRightPaneStatusText } from './utils/rightPaneStatus';
import './App.css';

const PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY = 'hanjson.performancePanel.visible.v2';
const MAX_HEADER_PATH_LENGTH = 120;

type RightEditorContextMenuState = {
  x: number;
  y: number;
  tabId: string;
  offset: number;
} | null;

function getCompactPathLabel(pathText: string) {
  return pathText.length > MAX_HEADER_PATH_LENGTH
    ? `${pathText.slice(0, MAX_HEADER_PATH_LENGTH - 3)}...`
    : pathText;
}

async function writeTextToClipboard(text: string) {
  if (window.electronAPI?.writeClipboardText) {
    await window.electronAPI.writeClipboardText(text);
    return;
  }

  await navigator.clipboard.writeText(text);
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
  const leftPaneSearch = usePaneSearchState();
  const rightPaneSearch = usePaneSearchState();
  const {
    isFindOpen: isLeftFindOpen,
    isSearchLoadingMore: isLeftSearchLoadingMore,
    matchIndex: leftMatchIndex,
    matches: leftMatches,
    resetSearchPaging: resetLeftSearchPaging,
    resetSearchState: resetLeftSearchState,
    searchHasMore: leftSearchHasMore,
    searchNextOffset: leftSearchNextOffset,
    searchOptions: leftSearchOptions,
    searchTerm: leftSearchTerm,
    setIsFindOpen: setIsLeftFindOpen,
    setIsSearchLoadingMore: setIsLeftSearchLoadingMore,
    setMatchIndex: setLeftMatchIndex,
    setMatches: setLeftMatches,
    setSearchHasMore: setLeftSearchHasMore,
    setSearchNextOffset: setLeftSearchNextOffset,
    setSearchOptions: setLeftSearchOptions,
    setSearchTerm: setLeftSearchTerm,
  } = leftPaneSearch;
  const {
    isFindOpen: isRightFindOpen,
    isSearchLoadingMore: isRightSearchLoadingMore,
    matchIndex: rightMatchIndex,
    matches: rightMatches,
    resetSearchPaging: resetRightSearchPaging,
    resetSearchState: resetRightSearchState,
    searchHasMore: rightSearchHasMore,
    searchNextOffset: rightSearchNextOffset,
    searchOptions: rightSearchOptions,
    searchTerm: rightSearchTerm,
    setIsFindOpen: setIsRightFindOpen,
    setIsSearchLoadingMore: setIsRightSearchLoadingMore,
    setMatchIndex: setRightMatchIndex,
    setMatches: setRightMatches,
    setSearchHasMore: setRightSearchHasMore,
    setSearchNextOffset: setRightSearchNextOffset,
    setSearchOptions: setRightSearchOptions,
    setSearchTerm: setRightSearchTerm,
  } = rightPaneSearch;
  const [leftReplaceText, setLeftReplaceText] = useState('');
  const [leftRawHighlightRange, setLeftRawHighlightRange] = useState<{ start: number; end: number } | null>(null);
  const [largeViewerMatchCount, setLargeViewerMatchCount] = useState(0);
  const [largeViewerMatches, setLargeViewerMatches] = useState<LargeJsonSearchMatch[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [wrapLongLines, setWrapLongLines] = useState(false);
  const [showPerformancePanel, setShowPerformancePanel] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.localStorage.getItem(PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY) !== 'false';
  });
  const [isDragImportActive, setIsDragImportActive] = useState(false);
  const [isDiagnosticsLogOpen, setIsDiagnosticsLogOpen] = useState(false);
  const [rightEditorContextMenu, setRightEditorContextMenu] = useState<RightEditorContextMenuState>(null);
  const {
    initializeTabArtifacts,
    largeRawViewerDataByTab,
    largeViewerCollapsedLinesByTab,
    largeViewerDataByTab,
    largeViewerStatusByTab,
    locateFeedbackByTab,
    processingStageByTab,
    removeTabArtifactsState,
    rightNodeSelectionByTab,
    setLargeRawViewerDataByTab,
    setLargeViewerCollapsedLinesByTab,
    setLargeViewerDataByTab,
    setLargeViewerStatusByTab,
    setLocateFeedbackByTab,
    setProcessingStageByTab,
    setRightNodeSelectionByTab,
  } = useJsonTabArtifacts(INITIAL_TAB_ID);

  const leftEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const rightEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const largeRawViewerRef = useRef<LargeRawReadonlyViewerHandle | null>(null);
  const largeViewerRef = useRef<LargeJsonReadonlyViewerHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragImportDepthRef = useRef(0);
  const rawTextByTabRef = useRef<Record<string, string>>({
    [INITIAL_TAB_ID]: '',
  });
  const formattedTextByTabRef = useRef<Record<string, string>>({
    [INITIAL_TAB_ID]: '',
  });
  const leftSearchWorkerRevisionRef = useRef<Record<string, number>>({});
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
  const rightContextMenuOffsetByTabRef = useRef<Record<string, number | null>>({});
  const highlightTimeoutRef = useRef<number | null>(null);
  const leftViewStateByTabRef = useRef<Record<string, monaco.editor.ICodeEditorViewState | null>>({});
  const rightViewStateByTabRef = useRef<Record<string, monaco.editor.ICodeEditorViewState | null>>({});
  const previousActiveTabIdRef = useRef(INITIAL_TAB_ID);
  const {
    beginPerformanceSession,
    clearPerformanceState,
    logEvent,
    mutatePerformanceSession,
    performanceByTab,
    performanceHistory,
    performanceSessionsRef,
    setPerformanceByTab,
    syncPerformanceSnapshot,
  } = useJsonPerformanceTracking({
    activeTabIdRef,
    initialTabId: INITIAL_TAB_ID,
  });
  const {
    closeEditJson,
    editJsonBusyLabel,
    editJsonError,
    editJsonSession,
    editJsonValueRef,
    hasCopiedLiteral,
    openDocumentEditSession,
    openNodeEditSession,
    setEditJsonBusyLabel,
    setEditJsonError,
    showCopyLiteralNotice,
  } = useJsonEditSession();

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
  const activeProcessingStage = activeTab
    ? processingStageByTab[activeTab.id] ?? 'idle'
    : 'idle';
  const activeLocateFeedback = activeTab
    ? locateFeedbackByTab[activeTab.id] ?? null
    : null;
  const activeRightNodeSelection = activeTab
    ? rightNodeSelectionByTab[activeTab.id] ?? null
    : null;
  const activeRightSelectedRange = activeRightNodeSelection
    ? {
      start: activeRightNodeSelection.startOffset,
      end: activeRightNodeSelection.endOffset,
    }
    : null;
  const isLargeFileLocateEnabled = activeTab
    ? Boolean(largeFileLocateEnabledByTab[activeTab.id])
    : false;
  const canEnableLargeFileLocate = activeTab
    ? activeDocumentMeta.rawLength > 0
    : false;
  const usesLightweightLocate = activeTab
    ? activeDocumentMeta.rawLength > STRUCTURE_SYNC_THRESHOLD
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
  const activeLargeRawViewerData = activeTab
    ? largeRawViewerDataByTab[activeTab.id] ?? null
    : null;
  const activeLargeViewerStatus = activeTab
    ? largeViewerStatusByTab[activeTab.id] ?? 'idle'
    : 'idle';
  const activeLargeViewerCollapsedLines = activeTab
    ? largeViewerCollapsedLinesByTab[activeTab.id] ?? []
    : [];
  const shouldUseDedicatedRightViewer = Boolean(activeLargeViewerData && formattedValue);
  const shouldUseDedicatedLeftViewer = Boolean(activeRawText && activeDocumentMeta.rawLength >= LARGE_FILE_THRESHOLD);
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
  const processingStageText = getProcessingStageText(activeProcessingStage, importingFileName);
  const leftPaneMetaText = [
    activeDocumentMeta.rawLength > 0 ? `内存 ${formatBytes(activeDocumentMeta.rawLength)}` : null,
    formatDuration(activePerformanceSnapshot?.readFileMs)
      ? `导入 ${formatDuration(activePerformanceSnapshot?.readFileMs)}`
      : null,
    activeLocateFeedback?.message ?? null,
  ].filter(Boolean).join(' · ');
  const rightPaneStatusText = getRightPaneStatusText({
    canEnableLargeFileLocate,
    canUseRightPaneFolding,
    currentStructureStatus,
    isLargeFileLocateEnabled,
    isLargeFileMode,
    usesLightweightLocate,
  });
  const rightPaneMetaText = [
    activeDocumentMeta.formattedLength > 0 ? `内存 ${formatBytes(activeDocumentMeta.formattedLength)}` : null,
    formatDuration(activePerformanceSnapshot?.formatWorkerMs)
      ? `格式化 ${formatDuration(activePerformanceSnapshot?.formatWorkerMs)}`
      : null,
    activeRightNodeSelection?.pathText
      ? `路径 ${getCompactPathLabel(activeRightNodeSelection.pathText)}`
      : null,
    rightPaneStatusText,
  ].filter(Boolean).join(' · ');
  const diagnosticsContext: DiagnosticsContextItem[] = activeTab ? [
    { label: 'tabId', value: activeTab.id },
    { label: 'tabTitle', value: activeTab.title },
    { label: 'rawBytes', value: activeDocumentMeta.rawLength },
    { label: 'formattedBytes', value: activeDocumentMeta.formattedLength },
    { label: 'rawLength', value: activeDocumentMeta.rawLength },
    { label: 'formattedLength', value: activeDocumentMeta.formattedLength },
    { label: 'largeMode', value: isLargeFileMode },
    { label: 'dedicatedLeftViewer', value: shouldUseDedicatedLeftViewer },
    { label: 'dedicatedRightViewer', value: shouldUseDedicatedRightViewer },
    { label: 'largeFileLocateEnabled', value: isLargeFileLocateEnabled },
    { label: 'lightweightLocate', value: usesLightweightLocate },
    { label: 'structureStatus', value: currentStructureStatus },
    { label: 'processingStage', value: activeProcessingStage },
    { label: 'isFormatting', value: isFormattingActiveTab },
    { label: 'importingFileName', value: importingFileName },
    { label: 'currentError', value: currentError },
    { label: 'rightSelectedPath', value: activeRightNodeSelection?.pathText },
    { label: 'leftSearch', value: leftSearchTerm ? `${normalizedLeftMatchIndex + 1}/${activeLeftMatchCount}${leftSearchHasMore ? '+' : ''}` : null },
    { label: 'rightSearch', value: rightSearchTerm ? `${normalizedRightMatchIndex + 1}/${activeRightMatchCount}${rightSearchHasMore ? '+' : ''}` : null },
    { label: 'performanceTrigger', value: activePerformanceSnapshot?.trigger },
    { label: 'performanceStatus', value: activePerformanceSnapshot?.status },
    { label: 'formatWorkerMs', value: activePerformanceSnapshot?.formatWorkerMs },
    { label: 'viewerIndexMs', value: activePerformanceSnapshot?.viewerIndexMs },
  ] : [];

  const clearLeftHighlights = () => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    setLeftRawHighlightRange(null);

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

  const copyValueAtOffset = async (tabId: string, offset: number, preferCachedText = false) => {
    const valueToCopy = await requestWorkerValue(tabId, offset, preferCachedText);
    if (valueToCopy === null) {
      setTabError(tabId, '未找到可复制的 JSON 值');
      logEvent('copy-value-missed', {
        tabId,
        offset,
        preferCachedText,
      });
      return;
    }

    try {
      await writeTextToClipboard(valueToCopy);
      setTabError(tabId, null);
      logEvent('copy-value-success', {
        tabId,
        offset,
        copiedLength: valueToCopy.length,
        preferCachedText,
        viaDesktopClipboard: Boolean(window.electronAPI?.writeClipboardText),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTabError(tabId, `复制值失败：${message}`);
      logEvent('copy-value-failed', {
        tabId,
        offset,
        preferCachedText,
        error: message,
      });
    }
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
    resetLeftSearchState();
    resetRightSearchState();
    setLeftReplaceText('');
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    setLeftRawHighlightRange(null);
    clearLeftHighlights();
    clearRightHighlights();
  };

  const setTabLargeMode = (tabId: string, enabled: boolean) => {
    largeModeRef.current[tabId] = enabled;
    setTabLargeModeState(tabId, enabled);
  };

  const setProcessingStage = (tabId: string, stage: ProcessingStage) => {
    setProcessingStageByTab((current) => ({ ...current, [tabId]: stage }));
  };

  const setLocateFeedback = (tabId: string, feedback: LocateFeedback | null) => {
    setLocateFeedbackByTab((current) => ({ ...current, [tabId]: feedback }));
  };

  const setRightNodeSelection = (tabId: string, selection: RightNodeSelection | null) => {
    setRightNodeSelectionByTab((current) => ({ ...current, [tabId]: selection }));
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
    setRightNodeSelection(tabId, null);
    if (tabId === activeTabIdRef.current) {
      setLargeViewerMatches([]);
      setLargeViewerMatchCount(0);
      resetRightSearchPaging();
    }
  };

  const setLargeRawViewerData = (tabId: string, data: LargeRawViewerData | null) => {
    setLargeRawViewerDataByTab((current) => ({ ...current, [tabId]: data }));
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

  const setLeftSearchResults = (
    tabId: string,
    matches: LargeJsonSearchMatch[],
    hasMore = false,
    nextStartOffset = 0,
    append = false
  ) => {
    if (tabId !== activeTabIdRef.current) {
      return;
    }
    setIsLeftSearchLoadingMore(false);

    const model = leftEditorRef.current?.getModel();
    if (!model) {
      return;
    }

    const ranges = matches.map((match) => {
      const start = model.getPositionAt(match.start);
      const end = model.getPositionAt(match.end);
      return new monaco.Range(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column
      );
    });

    setLeftMatches((current) => (append ? [...current, ...ranges] : ranges));
    setLeftSearchHasMore(hasMore);
    setLeftSearchNextOffset(nextStartOffset);
  };

  const getTabContent = (tabId: string) => rawTextByTabRef.current[tabId] ?? '';

  const updateTabContent = (tabId: string, content: string, syncModel = false) => {
    const byteLength = getUtf8ByteLength(content);
    rawTextByTabRef.current[tabId] = content;
    setLargeRawViewerData(tabId, null);
    setRightNodeSelection(tabId, null);
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
    setRightNodeSelection(tabId, null);
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

    if (byteLength >= LARGE_FILE_THRESHOLD) {
      if (activeTabIdRef.current === tabId) {
        leftViewStateByTabRef.current[tabId] = leftEditorRef.current?.saveViewState() ?? leftViewStateByTabRef.current[tabId] ?? null;
        leftEditorRef.current?.setModel(null);
      }
      disposeModel(path);
      logEvent('left-model-dedicated-viewer', {
        tabId,
        rawLength: byteLength,
      });
      return;
    }

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
        getMonacoOptions({
          largeMode: effectiveLargeMode,
          wrapLongLines,
          readOnly: true,
          enableStructuralFolding,
        })
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
    if (shouldUseDedicatedLeftViewer) {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      setLeftRawHighlightRange({ start: startOffset, end: endOffset });
      largeRawViewerRef.current?.revealRange(startOffset, endOffset);
      highlightTimeoutRef.current = window.setTimeout(() => {
        clearLeftHighlights();
      }, SEARCH_HIGHLIGHT_DURATION);
      return;
    }

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
    importJsonText,
    queueFormat,
    queueRepair,
    queueFormatAfterEditSave,
    removeTabArtifacts,
    requestWorkerSearch,
    requestWorkerLocate,
    requestWorkerValue,
    requestWorkerEditJson,
    requestWorkerEditJsonResult,
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
    setProcessingStage,
    setLocateFeedback,
    setRightNodeSelection,
    setStructureStatus,
    setLargeViewerData,
    setLargeRawViewerData,
    setLargeViewerStatus,
    setLargeViewerSearchResults,
    setLeftSearchResults,
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
    setRightEditorContextMenu(null);
  }, [activeTabId, shouldUseDedicatedRightViewer]);

  useEffect(() => {
    if (!rightEditorContextMenu) {
      return;
    }

    const closeContextMenu = () => setRightEditorContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('pointerdown', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('pointerdown', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [rightEditorContextMenu]);

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
    if (!shouldUseDedicatedLeftViewer) {
      leftEditorRef.current?.updateOptions(getMonacoOptions({
        largeMode: isLargeFileMode,
        wrapLongLines,
      }));
      leftEditorRef.current?.layout();
    }
    if (!shouldUseDedicatedRightViewer && !isBuildingDedicatedRightViewer) {
      rightEditorRef.current?.updateOptions(
        getMonacoOptions({
          largeMode: isLargeFileMode,
          wrapLongLines,
          readOnly: true,
          enableStructuralFolding: shouldEnableRightPaneFolding,
        })
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
    shouldUseDedicatedLeftViewer,
    shouldEnableRightPaneFolding,
    shouldUseDedicatedRightViewer,
    wrapLongLines,
  ]);

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
    if (!activeTab || !leftSearchTerm) {
      setLeftMatches([]);
      setLeftSearchHasMore(false);
      setLeftSearchNextOffset(0);
      setIsLeftSearchLoadingMore(false);
      clearLeftHighlights();
      return;
    }

    setIsLeftSearchLoadingMore(false);
    const rawRevision = activeDocumentMeta.rawRevision;
    const shouldSendRawText = leftSearchWorkerRevisionRef.current[activeTab.id] !== rawRevision;

    requestWorkerSearch(
      activeTab.id,
      leftSearchTerm,
      leftSearchOptions,
      0,
      false,
      'left',
      shouldSendRawText ? getTabContent(activeTab.id) : undefined,
      rawRevision
    );
    if (shouldSendRawText) {
      leftSearchWorkerRevisionRef.current[activeTab.id] = rawRevision;
    }
  }, [
    activeDocumentMeta.rawRevision,
    activeTab,
    leftSearchOptions,
    leftSearchTerm,
  ]);

  useEffect(() => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();

    if (!editor || !model || !leftSearchTerm) {
      clearLeftHighlights();
      return;
    }

    const activeIndex = leftMatches.length > 0
      ? ((leftMatchIndex % leftMatches.length) + leftMatches.length) % leftMatches.length
      : 0;
    const nextDecorations = leftMatches.map((range, index) => ({
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

    if (leftMatches.length === 0) {
      return;
    }

    const activeMatch = leftMatches[activeIndex];
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
    leftMatches,
    leftMatchIndex,
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

  useRightNodeSelectionHighlight({
    editorRef: rightEditorRef,
    isDisabled: shouldUseDedicatedRightViewer || isBuildingDedicatedRightViewer,
    selection: activeRightNodeSelection,
  });

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

  const handleLeftMount: OnMount = (editor) => {
    leftEditorRef.current = editor;
    const currentTabId = activeTabIdRef.current;
    syncLeftModel(currentTabId, getTabContent(currentTabId), true);
    const leftEditorFocusContextKey = 'hanjsonLeftEditorFocused';

    editor.onDidDispose(() => {
      if (leftEditorRef.current === editor) {
        leftEditorRef.current = null;
      }
    });

    const clearSelectedDocument = () => {
      const currentTabId = activeTabIdRef.current;

      if (currentTabId) {
        renameTab(currentTabId, DEFAULT_TAB_TITLE);
        resetTabArtifacts(currentTabId);
        resetSearchState();
      }
    };

    bindEditorFocusContext(editor, leftEditorFocusContextKey);

    registerSelectAllDeleteCommands(monaco, editor, {
      focusContextKey: leftEditorFocusContextKey,
      onClearAll: clearSelectedDocument,
      selectionCoversModel: () => selectionCoversModel(editor),
    });

    registerPaneFindAction(monaco, editor, {
      actionId: 'openLeftPaneFind',
      label: '搜索原始 JSON',
      focusContextKey: leftEditorFocusContextKey,
      onOpen: openLeftFind,
    });

    editor.addAction({
      id: 'custom.clipboardPasteAction',
      label: 'Custom Paste',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
      precondition: leftEditorFocusContextKey,
      keybindingContext: leftEditorFocusContextKey,
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
    const rightEditorFocusContextKey = 'hanjsonRightEditorFocused';
    logRightEditorState('right-editor-mounted', currentTabId, {
      wrapLongLines,
    });

    editor.onDidDispose(() => {
      if (rightEditorRef.current === editor) {
        rightEditorRef.current = null;
      }
    });

    bindEditorFocusContext(editor, rightEditorFocusContextKey);

    const getRightActionOffset = (mountedEditor: monaco.editor.ICodeEditor) => {
      const currentTabId = activeTabIdRef.current;
      const model = mountedEditor.getModel();

      if (!model) {
        return null;
      }

      const contextMenuOffset = rightContextMenuOffsetByTabRef.current[currentTabId];
      if (typeof contextMenuOffset === 'number') {
        rightContextMenuOffsetByTabRef.current[currentTabId] = null;
        return { tabId: currentTabId, offset: contextMenuOffset };
      }

      const position = mountedEditor.getPosition();
      if (!position) {
        return null;
      }

      return { tabId: currentTabId, offset: model.getOffsetAt(position) };
    };

    editor.onContextMenu((event) => {
      const currentTabId = activeTabIdRef.current;
      const model = editor.getModel();
      const position = event.target.position ?? editor.getPosition();
      const browserEvent = event.event.browserEvent as MouseEvent | undefined;

      event.event.preventDefault();
      event.event.stopPropagation();

      if (!model || !position) {
        rightContextMenuOffsetByTabRef.current[currentTabId] = null;
        setRightEditorContextMenu(null);
        return;
      }

      const offset = model.getOffsetAt(position);
      rightContextMenuOffsetByTabRef.current[currentTabId] = offset;
      setRightEditorContextMenu({
        tabId: currentTabId,
        offset,
        x: browserEvent?.clientX ?? event.event.posx ?? 0,
        y: browserEvent?.clientY ?? event.event.posy ?? 0,
      });
    });

    editor.onMouseDown((event) => {
      if (event.event.rightButton) {
        return;
      }

      rightContextMenuOffsetByTabRef.current[activeTabIdRef.current] = null;
      setRightEditorContextMenu(null);
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

    registerPaneFindAction(monaco, editor, {
      actionId: 'openRightPaneFind',
      label: '搜索格式化结果',
      focusContextKey: rightEditorFocusContextKey,
      onOpen: openRightFind,
    });

    editor.addAction({
      id: 'copyValueAction',
      label: '复制值',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: async (mountedEditor) => {
        const actionOffset = getRightActionOffset(mountedEditor);
        if (!actionOffset) {
          return;
        }

        await copyValueAtOffset(actionOffset.tabId, actionOffset.offset);
      },
    });

    editor.addAction({
      id: 'editValueAction',
      label: '编辑当前值',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 2,
      run: async (mountedEditor) => {
        const actionOffset = getRightActionOffset(mountedEditor);
        if (!actionOffset) {
          return;
        }

        await handleOpenEditNodeAtOffset(actionOffset.tabId, actionOffset.offset);
      },
    });

    editor.addAction({
      id: 'unescapeValueAction',
      label: '反转义当前值',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 3,
      run: async (mountedEditor) => {
        const actionOffset = getRightActionOffset(mountedEditor);
        if (!actionOffset) {
          return;
        }

        await handleOpenUnescapedNodeAtOffset(actionOffset.tabId, actionOffset.offset);
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

  const handleImport = async () => {
    if (!activeTab) {
      return;
    }

    if (window.electronAPI?.openJsonFile) {
      try {
        const file = await window.electronAPI.openJsonFile();
        if (!file) {
          return;
        }

        await importJsonText(activeTab.id, file.name, file.size, file.content);
      } catch (error) {
        setTabError(
          activeTab.id,
          error instanceof Error ? `导入失败：${error.message}` : '导入失败'
        );
      }
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    const file = getFirstJsonImportFile(selectedFiles);
    event.target.value = '';

    if (!activeTab || !selectedFiles || selectedFiles.length === 0) {
      return;
    }

    if (!file) {
      setTabError(activeTab.id, '请选择 .json 或 .txt 文件');
      return;
    }

    await importJsonFile(activeTab.id, file);
  };

  const hasDraggedFiles = (event: React.DragEvent<HTMLDivElement>) => (
    Array.from(event.dataTransfer.types).includes('Files')
  );

  const handleImportDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    dragImportDepthRef.current += 1;
    setIsDragImportActive(true);
  };

  const handleImportDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleImportDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragImportDepthRef.current = Math.max(0, dragImportDepthRef.current - 1);
    if (dragImportDepthRef.current === 0) {
      setIsDragImportActive(false);
    }
  };

  const handleImportDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragImportDepthRef.current = 0;
    setIsDragImportActive(false);

    if (!activeTab) {
      return;
    }

    const file = getFirstJsonImportFile(event.dataTransfer.files);
    if (!file) {
      setTabError(activeTab.id, '请拖入 .json 或 .txt 文件');
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

  const handleRepairJson = () => {
    if (!activeTab) {
      return;
    }

    const currentText = getTabContent(activeTab.id);
    if (!currentText.trim()) {
      setTabError(activeTab.id, '没有可修复的 JSON 内容');
      return;
    }

    const largeMode = isLargeDocument(currentText);
    beginPerformanceSession(
      activeTab.id,
      'repair',
      activeTab.title,
      null,
      getUtf8ByteLength(currentText),
      largeMode
    );
    setTabLargeMode(activeTab.id, largeMode);
    queueRepair(activeTab.id, currentText);
  };

  const handleJsonEscapeTransform = async (
    operation: Extract<EditJsonWorkerOperation, 'escape-json' | 'unescape-json'>,
    label: string
  ) => {
    if (!activeTab) {
      return;
    }

    const currentTabId = activeTab.id;
    const editor = leftEditorRef.current;
    const model = editor?.getModel() ?? null;
    const selection = editor?.getSelection() ?? null;
    const hasSelection = Boolean(model && selection && !selection.isEmpty());
    const sourceText = hasSelection && model && selection
      ? model.getValueInRange(selection)
      : getTabContent(currentTabId);

    if (!sourceText.trim()) {
      setTabError(currentTabId, `没有可${label}的内容`);
      return;
    }

    setEditJsonBusyLabel(`正在${label}...`);
    try {
      const transformed = await requestWorkerEditJson(currentTabId, operation, sourceText);
      const nextContent = hasSelection && model && selection
        ? getContentAfterSelectionReplace(model, selection, transformed)
        : transformed;
      const largeMode = isLargeDocument(nextContent);

      setTabLargeMode(currentTabId, largeMode);
      setTabError(currentTabId, null);

      if (hasSelection && editor && selection) {
        editor.executeEdits('json-escape-transform', [{
          range: selection,
          text: transformed,
          forceMoveMarkers: true,
        }]);
        resetSearchState();
        return;
      }

      updateTabContent(currentTabId, transformed, true);
      resetSearchState();
      queueFormat(currentTabId, transformed, true);
    } catch (error) {
      setTabError(
        currentTabId,
        error instanceof Error ? `${label}失败：${error.message}` : `${label}失败`
      );
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleUnescapeJson = () => {
    void handleJsonEscapeTransform('unescape-json', '反转义');
  };

  const handleEscapeJson = () => {
    void handleJsonEscapeTransform('escape-json', '转义');
  };

  const handleOpenEditJson = async () => {
    if (!activeTab) {
      return;
    }

    setEditJsonBusyLabel('正在准备编辑内容...');
    try {
      const raw = getTabContent(activeTab.id);
      const formatted = await requestWorkerEditJson(activeTab.id, 'format', raw);
      openDocumentEditSession(formatted);
    } catch (error) {
      setTabError(
        activeTab.id,
        error instanceof Error ? `打开 JSON 编辑失败：${error.message}` : '打开 JSON 编辑失败'
      );
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleOpenEditNodeAtOffset = async (
    tabId: string,
    offset: number,
    preferCachedText = false
  ) => {
    setEditJsonBusyLabel('正在准备当前节点...');
    try {
      const sourceText = preferCachedText
        ? ''
        : (formattedTextByTabRef.current[tabId] ?? '');
      const payload = await requestWorkerEditJson(
        tabId,
        'read-node',
        sourceText,
        undefined,
        undefined,
        offset
      );
      const parsed = JSON.parse(payload) as { path?: JsonEditPath; value?: string };

      if (
        !Array.isArray(parsed.path)
        || !parsed.path.every((segment) => typeof segment === 'string' || typeof segment === 'number')
        || typeof parsed.value !== 'string'
      ) {
        throw new Error('当前节点无法编辑');
      }

      openNodeEditSession(parsed.value, parsed.path);
    } catch (error) {
      setTabError(
        tabId,
        error instanceof Error ? `打开当前节点编辑失败：${error.message}` : '打开当前节点编辑失败'
      );
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleOpenUnescapedNodeAtOffset = async (
    tabId: string,
    offset: number,
    preferCachedText = false
  ) => {
    setEditJsonBusyLabel('正在反转义当前节点...');
    try {
      const sourceText = preferCachedText
        ? ''
        : (formattedTextByTabRef.current[tabId] ?? '');
      const payload = await requestWorkerEditJson(
        tabId,
        'read-node',
        sourceText,
        undefined,
        undefined,
        offset
      );
      const parsed = JSON.parse(payload) as { path?: JsonEditPath; value?: string };

      if (
        !Array.isArray(parsed.path)
        || !parsed.path.every((segment) => typeof segment === 'string' || typeof segment === 'number')
        || typeof parsed.value !== 'string'
      ) {
        throw new Error('当前节点无法反转义');
      }

      const nodeValue = JSON.parse(parsed.value);
      if (typeof nodeValue !== 'string') {
        throw new Error('当前节点不是字符串值');
      }

      const transformed = await requestWorkerEditJson(tabId, 'unescape-json', parsed.value);
      JSON.parse(transformed);
      openNodeEditSession(transformed, parsed.path);
    } catch (error) {
      setTabError(
        tabId,
        error instanceof Error ? `反转义当前节点失败：${error.message}` : '反转义当前节点失败'
      );
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleSaveEditJson = async () => {
    if (!activeTab) {
      return;
    }

    const currentTabId = activeTab.id;
    const currentTabTitle = activeTab.title;
    const isNodeEdit = editJsonSession?.mode === 'node';
    setEditJsonBusyLabel(isNodeEdit ? '正在更新当前节点...' : '正在更新原始 JSON...');
    try {
      const original = getTabContent(currentTabId);
      const saveResult = await requestWorkerEditJsonResult(
        currentTabId,
        isNodeEdit ? 'save-node' : 'save',
        editJsonValueRef.current,
        original,
        editJsonSession?.path
      );
      const updated = saveResult.data;
      if (typeof updated !== 'string') {
        throw new Error('JSON worker returned an empty result');
      }
      const largeMode = isLargeDocument(updated);
      beginPerformanceSession(
        currentTabId,
        'edit-save',
        currentTabTitle,
        null,
        getUtf8ByteLength(updated),
        largeMode
      );

      mutatePerformanceSession(currentTabId, (session) => {
        session.leftModelStartedAt = performance.now();
      });
      updateTabContent(currentTabId, updated, true);
      mutatePerformanceSession(currentTabId, (session) => {
        session.leftModelCompletedAt = performance.now();
      });
      setTabLargeMode(currentTabId, largeMode);
      setEditJsonError(null);
      closeEditJson();
      resetSearchState();
      if (isNodeEdit && typeof saveResult.formattedText === 'string') {
        const rightModelStartedAt = performance.now();
        updateFormattedContent(currentTabId, saveResult.formattedText, true);
        const rightModelCompletedAt = performance.now();
        setLargeRawViewerData(currentTabId, saveResult.rawViewerData ?? null);
        setLargeViewerData(currentTabId, saveResult.viewerData ?? null);
        setLargeViewerStatus(currentTabId, saveResult.viewerData ? 'ready' : 'idle');
        setStructureStatus(
          currentTabId,
          saveResult.structureWarming
            ? 'building'
            : (workerStructureEnabledRef.current[currentTabId] ? 'ready' : (largeMode ? 'disabled' : 'ready'))
        );
        setProcessingStage(currentTabId, saveResult.structureWarming ? 'building-index' : 'idle');
        setTabFormatting(currentTabId, false);
        mutatePerformanceSession(currentTabId, (session) => {
          session.pendingFormat = false;
          session.requestId = null;
          session.formatQueuedAt = rightModelStartedAt;
          session.formatStartedAt = rightModelStartedAt;
          session.formatCompletedAt = rightModelStartedAt;
          session.rightModelStartedAt = rightModelStartedAt;
          session.rightModelCompletedAt = rightModelCompletedAt;
          session.formattedBytes = getUtf8ByteLength(saveResult.formattedText ?? '');
          session.viewerIndexMs = typeof saveResult.viewerIndexMs === 'number'
            ? saveResult.viewerIndexMs
            : null;
          session.viewerReadyAt = rightModelCompletedAt;
          session.structureCompletedAt = rightModelCompletedAt;
          session.structureEnabled = Boolean(workerStructureEnabledRef.current[currentTabId]);
          session.status = 'ready';
          session.error = null;
        }, true);
      } else {
        queueFormatAfterEditSave(currentTabId, updated);
      }
    } catch (error) {
      setEditJsonError(
        error instanceof Error ? `保存 JSON 失败：${error.message}` : '保存 JSON 失败'
      );
      setEditJsonBusyLabel(null);
    }
  };

  const handleTransformEditJsonContent = async (
    operation: Extract<EditJsonWorkerOperation, 'escape-json' | 'unescape-json'>,
    label: string,
    value: string
  ) => {
    if (!activeTab) {
      throw new Error('当前没有可编辑的 JSON');
    }

    if (!value.trim()) {
      const errorMessage = `没有可${label}的编辑内容`;
      setEditJsonError(errorMessage);
      throw new Error(errorMessage);
    }

    setEditJsonBusyLabel(`正在${label}编辑内容...`);
    try {
      const transformed = await requestWorkerEditJson(activeTab.id, operation, value);
      editJsonValueRef.current = transformed;
      setEditJsonError(null);
      return transformed;
    } catch (error) {
      setEditJsonError(
        error instanceof Error ? `${label}编辑内容失败：${error.message}` : `${label}编辑内容失败`
      );
      throw error;
    } finally {
      setEditJsonBusyLabel(null);
    }
  };

  const handleUnescapeEditJsonContent = (value: string) => (
    handleTransformEditJsonContent('unescape-json', '反转义', value)
  );

  const handleEscapeEditJsonContent = (value: string) => (
    handleTransformEditJsonContent('escape-json', '转义', value)
  );

  const handleCopyEscapedJson = async () => {
    if (!activeTab) {
      return;
    }

    setEditJsonBusyLabel('正在复制字符串字面量...');
    try {
      const literal = await requestWorkerEditJson(activeTab.id, 'copy-literal', editJsonValueRef.current);
      await writeTextToClipboard(literal);
      setEditJsonError(null);
      showCopyLiteralNotice();
    } catch (error) {
      setEditJsonError(
        error instanceof Error ? `复制字符串字面量失败：${error.message}` : '复制字符串字面量失败'
      );
    } finally {
      setEditJsonBusyLabel(null);
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
    delete leftSearchWorkerRevisionRef.current[activeTab.id];
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
    initializeTabArtifacts(nextId);
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
    delete leftSearchWorkerRevisionRef.current[tabId];
    removeTabArtifacts(tabId);
    removeTabArtifactsState(tabId);

    if (activeTabId === tabId) {
      setActiveTabId(fallbackTab.id);
    }
  };

  const openLeftFind = () => {
    if (shouldUseDedicatedLeftViewer) {
      return;
    }

    setIsLeftFindOpen(true);
  };

  const openRightFind = () => {
    setIsRightFindOpen(true);
  };

  const closeLeftFind = () => {
    resetLeftSearchState();
    clearLeftHighlights();
    leftEditorRef.current?.focus();
  };

  const closeRightFind = () => {
    resetRightSearchState();
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    clearRightHighlights();
    if (shouldUseDedicatedRightViewer) {
      largeViewerRef.current?.focus();
    } else {
      rightEditorRef.current?.focus();
    }
  };

  const handleLeftSearchOptionsChange = (value: JsonSearchOptions) => {
    setLeftSearchOptions(value);
    resetLeftSearchPaging();
  };

  const handleRightSearchOptionsChange = (value: JsonSearchOptions) => {
    setRightSearchOptions(value);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    resetRightSearchPaging();
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
    if (!activeTab || !leftSearchTerm || !leftSearchHasMore || isLeftSearchLoadingMore) {
      return;
    }

    setIsLeftSearchLoadingMore(true);
    requestWorkerSearch(
      activeTab.id,
      leftSearchTerm,
      leftSearchOptions,
      leftSearchNextOffset,
      true,
      'left',
      undefined,
      activeDocumentMeta.rawRevision
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
    resetLeftSearchPaging();
  };

  const handleRightSearchTermChange = (value: string) => {
    setRightSearchTerm(value);
    setLargeViewerMatches([]);
    setLargeViewerMatchCount(0);
    resetRightSearchPaging();
  };

  if (!activeTab) {
    return null;
  }

  return (
    <div
      className={isDarkMode ? 'app-container dark-mode' : 'app-container'}
      onDragEnter={handleImportDragEnter}
      onDragOver={handleImportDragOver}
      onDragLeave={handleImportDragLeave}
      onDrop={handleImportDrop}
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

      {isDragImportActive && (
        <div className="drag-import-overlay">
          <div className={`drag-import-panel ${isDarkMode ? 'dark' : ''}`}>
            <span className="drag-import-title">释放导入 JSON</span>
            <span className="drag-import-subtitle">当前标签会读取拖入的 .json / .txt 文件</span>
          </div>
        </div>
      )}

      <JsonToolToolbar
        onImport={handleImport}
        onFormat={handleFormat}
        onRepairJson={handleRepairJson}
        onUnescapeJson={handleUnescapeJson}
        onEscapeJson={handleEscapeJson}
        onClear={handleClear}
        onEditJson={handleOpenEditJson}
        onOpenDiagnosticsLog={() => setIsDiagnosticsLogOpen(true)}
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
        usesLightweightLocate={usesLightweightLocate}
        currentStructureStatus={currentStructureStatus}
        processingStageText={processingStageText}
        currentError={currentError}
      />

      {showPerformancePanel && (
        <JsonPerformancePanel
          snapshot={activePerformanceSnapshot}
          history={performanceHistory}
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
          busyLabel={editJsonBusyLabel}
          hasCopiedLiteral={hasCopiedLiteral}
          title={editJsonSession.mode === 'node' ? '编辑当前节点' : '编辑 JSON'}
          pathText={editJsonSession.pathText}
          saveLabel={editJsonSession.mode === 'node' ? '更新当前节点' : '更新为原始 JSON'}
          onValueChange={(value) => {
            editJsonValueRef.current = value;
          }}
          onSave={handleSaveEditJson}
          onUnescapeContent={handleUnescapeEditJsonContent}
          onEscapeContent={handleEscapeEditJsonContent}
          onCopyLiteral={handleCopyEscapedJson}
          onClose={closeEditJson}
        />
      )}

      {isDiagnosticsLogOpen && (
        <DiagnosticsLogPanel
          isDarkMode={isDarkMode}
          context={diagnosticsContext}
          onClose={() => setIsDiagnosticsLogOpen(false)}
        />
      )}

      <JsonEditorPanes
        activeLargeRawViewerData={activeLargeRawViewerData}
        activeLargeViewerCollapsedLines={activeLargeViewerCollapsedLines}
        activeLargeViewerData={activeLargeViewerData}
        activeLeftMatchCount={activeLeftMatchCount}
        activeRawText={activeRawText}
        activeRightMatchCount={activeRightMatchCount}
        formattedValue={formattedValue}
        isBuildingDedicatedRightViewer={isBuildingDedicatedRightViewer}
        isDarkMode={isDarkMode}
        isFormattingActiveTab={isFormattingActiveTab}
        isImportingActiveTab={isImportingActiveTab}
        isLargeFileMode={isLargeFileMode}
        isLeftFindOpen={isLeftFindOpen}
        isRightFindOpen={isRightFindOpen}
        largeRawViewerRef={largeRawViewerRef}
        largeViewerMatches={largeViewerMatches}
        largeViewerRef={largeViewerRef}
        leftPaneMetaText={leftPaneMetaText}
        leftRawHighlightRange={leftRawHighlightRange}
        leftReplaceText={leftReplaceText}
        leftSearchHasMore={leftSearchHasMore}
        leftSearchOptions={leftSearchOptions}
        leftSearchTerm={leftSearchTerm}
        normalizedLeftMatchIndex={normalizedLeftMatchIndex}
        normalizedRightMatchIndex={normalizedRightMatchIndex}
        processingStageText={processingStageText}
        rightMatchIndex={rightMatchIndex}
        rightPaneMetaText={rightPaneMetaText}
        rightSearchHasMore={rightSearchHasMore}
        rightSearchOptions={rightSearchOptions}
        rightSelectedRange={activeRightSelectedRange}
        rightSearchTerm={rightSearchTerm}
        shouldEnableRightPaneFolding={shouldEnableRightPaneFolding}
        shouldShowLeftPlaceholder={activeDocumentMeta.rawLength === 0 && !isImportingActiveTab}
        shouldUseDedicatedLeftViewer={shouldUseDedicatedLeftViewer}
        shouldUseDedicatedRightViewer={shouldUseDedicatedRightViewer}
        wrapLongLines={wrapLongLines}
        isLeftSearchLoadingMore={isLeftSearchLoadingMore}
        isRightSearchLoadingMore={isRightSearchLoadingMore}
        onCloseLeftFind={closeLeftFind}
        onCloseRightFind={closeRightFind}
        onCopyRightValue={(offset) => copyValueAtOffset(activeTab.id, offset, true)}
        onEditRightValue={(offset) => handleOpenEditNodeAtOffset(activeTab.id, offset, true)}
        onLeftChange={handleLeftChange}
        onLeftMount={handleLeftMount}
        onLeftReplace={replaceLeftMatch}
        onLeftReplaceAll={replaceAllLeftMatches}
        onLeftReplaceValueChange={setLeftReplaceText}
        onLeftSearchOptionsChange={handleLeftSearchOptionsChange}
        onLeftSearchTermChange={handleLeftSearchTermChange}
        onLoadMoreLeftSearch={loadMoreLeftSearch}
        onLoadMoreRightSearch={loadMoreRightSearch}
        onLocateRightOffset={(offset) => requestWorkerLocate(activeTab.id, offset)}
        onOpenRightFind={openRightFind}
        onUnescapeRightValue={(offset) => handleOpenUnescapedNodeAtOffset(activeTab.id, offset, true)}
        onPrevLeft={gotoPrevLeft}
        onPrevRight={gotoPrevRight}
        onNextLeft={gotoNextLeft}
        onNextRight={gotoNextRight}
        onRightCollapsedLinesChange={(lines) => {
          setLargeViewerCollapsedLinesByTab((current) => ({
            ...current,
            [activeTab.id]: lines,
          }));
        }}
        onRightMatchCountChange={setLargeViewerMatchCount}
        onRightMount={handleRightMount}
        onRightSearchOptionsChange={handleRightSearchOptionsChange}
        onRightSearchTermChange={handleRightSearchTermChange}
      />

      {rightEditorContextMenu && !shouldUseDedicatedRightViewer && (
        <div
          className={`large-json-context-menu ${isDarkMode ? 'dark' : ''}`}
          style={{
            left: rightEditorContextMenu.x,
            top: rightEditorContextMenu.y,
          }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="large-json-context-menu-item"
            onClick={async () => {
              const { tabId, offset } = rightEditorContextMenu;
              setRightEditorContextMenu(null);
              await copyValueAtOffset(tabId, offset, true);
            }}
          >
            复制值
          </button>
          <button
            type="button"
            className="large-json-context-menu-item"
            onClick={async () => {
              const { tabId, offset } = rightEditorContextMenu;
              setRightEditorContextMenu(null);
              await handleOpenEditNodeAtOffset(tabId, offset, true);
            }}
          >
            编辑当前值
          </button>
          <button
            type="button"
            className="large-json-context-menu-item"
            onClick={async () => {
              const { tabId, offset } = rightEditorContextMenu;
              setRightEditorContextMenu(null);
              await handleOpenUnescapedNodeAtOffset(tabId, offset, true);
            }}
          >
            反转义当前值
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
