import React, { useEffect, useRef, useState } from 'react';
import Split from 'react-split';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { findNodeAtLocation, getLocation, Node as JsonNode, parseTree } from 'jsonc-parser';
import JsonEditModal from './components/JsonEditModal';
import JsonPerformancePanel from './components/JsonPerformancePanel';
import JsonToolTabBar from './components/JsonToolTabBar';
import JsonToolToolbar from './components/JsonToolToolbar';
import {
  DEFAULT_TAB_TITLE,
  EMPTY_DOCUMENT_META,
  FORMAT_DEBOUNCE_MS,
  INITIAL_TAB_ID,
  LARGE_FILE_FORMAT_DEBOUNCE_MS,
  LARGE_FILE_THRESHOLD,
  PerformanceSnapshot,
  PerformanceSnapshotStatus,
  PerformanceTrigger,
  RenamingTabState,
  SEARCH_HIGHLIGHT_DURATION,
  StructureStatus,
  STRUCTURE_SYNC_THRESHOLD,
  Tab,
  TabDocumentMeta,
  WorkerMessage,
} from './types/jsonTool';
import {
  canUseStructureSync,
  createTab,
  disposeModel,
  getEditorLanguageByLength,
  getFileName,
  getLeftModelPath,
  getOrCreateModel,
  getRightModelPath,
  getUtf8ByteLength,
  isLargeDocument,
  recreateModel,
  selectionCoversModel,
} from './utils/jsonToolModels';
import './App.css';

declare global {
  interface Window {
    electronAPI?: {
      selectJsonFile: () => Promise<string | null>;
      readJsonFile: (filePath: string) => Promise<string>;
      appendLog: (payload: string) => Promise<string>;
      getLogPath: () => Promise<string>;
    };
  }
}

type PerformanceSession = {
  requestId: number | null;
  pendingFormat: boolean;
  trigger: PerformanceTrigger;
  sourceLabel: string;
  fileSizeBytes: number | null;
  rawBytes: number;
  formattedBytes: number;
  largeMode: boolean;
  structureEnabled: boolean;
  startedAt: number;
  readStartedAt?: number;
  readCompletedAt?: number;
  leftModelStartedAt?: number;
  leftModelCompletedAt?: number;
  formatQueuedAt?: number;
  formatStartedAt?: number;
  formatCompletedAt?: number;
  rightModelStartedAt?: number;
  rightModelCompletedAt?: number;
  structureCompletedAt?: number;
  status: PerformanceSnapshotStatus;
  error: string | null;
};

const PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY = 'hanjson.performancePanel.visible';

const App: React.FC = () => {
  const [tabs, setTabs] = useState<Tab[]>([createTab(INITIAL_TAB_ID, 'HelloJson')]);
  const [activeTabId, setActiveTabId] = useState(INITIAL_TAB_ID);
  const [renamingTab, setRenamingTab] = useState<RenamingTabState | null>(null);
  const [documentMetaByTab, setDocumentMetaByTab] = useState<Record<string, TabDocumentMeta>>({
    [INITIAL_TAB_ID]: EMPTY_DOCUMENT_META,
  });
  const [errorsByTab, setErrorsByTab] = useState<Record<string, string | null>>({
    [INITIAL_TAB_ID]: null,
  });
  const [importingByTab, setImportingByTab] = useState<Record<string, string | null>>({
    [INITIAL_TAB_ID]: null,
  });
  const [isFormattingByTab, setIsFormattingByTab] = useState<Record<string, boolean>>({
    [INITIAL_TAB_ID]: false,
  });
  const [largeModeByTab, setLargeModeByTab] = useState<Record<string, boolean>>({
    [INITIAL_TAB_ID]: false,
  });
  const [largeFileLocateEnabledByTab, setLargeFileLocateEnabledByTab] = useState<Record<string, boolean>>({
    [INITIAL_TAB_ID]: false,
  });
  const [structureStatusByTab, setStructureStatusByTab] = useState<Record<string, StructureStatus>>({
    [INITIAL_TAB_ID]: 'ready',
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
  const [performanceByTab, setPerformanceByTab] = useState<Record<string, PerformanceSnapshot | null>>({
    [INITIAL_TAB_ID]: null,
  });

  const leftEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const rightEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const rawTextByTabRef = useRef<Record<string, string>>({
    [INITIAL_TAB_ID]: '',
  });
  const formattedTextByTabRef = useRef<Record<string, string>>({
    [INITIAL_TAB_ID]: '',
  });
  const suppressLeftChangeRef = useRef<Record<string, boolean>>({});
  const formatTimersRef = useRef<Record<string, number>>({});
  const latestRequestRef = useRef<Record<string, number>>({});
  const requestCounterRef = useRef(0);
  const locateRequestCounterRef = useRef(0);
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
  const leftTreesRef = useRef<Record<string, JsonNode | undefined>>({});
  const rightTreesRef = useRef<Record<string, JsonNode | undefined>>({});
  const leftDecorationIdsRef = useRef<string[]>([]);
  const rightDecorationIdsRef = useRef<string[]>([]);
  const highlightTimeoutRef = useRef<number | null>(null);
  const editJsonValueRef = useRef('');
  const copyLiteralTimeoutRef = useRef<number | null>(null);
  const performanceSessionsRef = useRef<Record<string, PerformanceSession>>({});

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
  const activePerformanceSnapshot = activeTab
    ? performanceByTab[activeTab.id] ?? null
    : null;

  const clearPendingFormat = (tabId: string) => {
    const timeoutId = formatTimersRef.current[tabId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete formatTimersRef.current[tabId];
    }
  };

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

  const resetSearchState = () => {
    setSearchTerm('');
    setRightMatches([]);
    setCurrentMatchIndex(0);
    clearLeftHighlights();
    clearRightHighlights();
  };

  const setTabError = (tabId: string, message: string | null) => {
    setErrorsByTab((current) => ({ ...current, [tabId]: message }));
  };

  const setTabLargeMode = (tabId: string, enabled: boolean) => {
    largeModeRef.current[tabId] = enabled;
    setLargeModeByTab((current) => ({ ...current, [tabId]: enabled }));
  };

  const setTabImporting = (tabId: string, fileName: string | null) => {
    setImportingByTab((current) => ({ ...current, [tabId]: fileName }));
  };

  const setTabFormatting = (tabId: string, formatting: boolean) => {
    setIsFormattingByTab((current) => ({ ...current, [tabId]: formatting }));
  };

  const setLargeFileLocateEnabled = (tabId: string, enabled: boolean) => {
    largeFileLocateEnabledRef.current[tabId] = enabled;
    setLargeFileLocateEnabledByTab((current) => ({ ...current, [tabId]: enabled }));
  };

  const setStructureStatus = (tabId: string, status: StructureStatus) => {
    structureStatusRef.current[tabId] = status;
    setStructureStatusByTab((current) => ({ ...current, [tabId]: status }));
  };

  const setDocumentMeta = (
    tabId: string,
    updater: (current: TabDocumentMeta) => TabDocumentMeta
  ) => {
    setDocumentMetaByTab((current) => ({
      ...current,
      [tabId]: updater(current[tabId] ?? EMPTY_DOCUMENT_META),
    }));
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

  const logEvent = (event: string, details: Record<string, unknown> = {}) => {
    window.electronAPI?.appendLog(JSON.stringify({
      event,
      activeTabId: activeTabIdRef.current,
      ...details,
    })).catch(() => {
      // Ignore logging failures in the renderer path.
    });
  };

  const measureDuration = (start?: number, end?: number) => (
    typeof start === 'number' && typeof end === 'number'
      ? Math.round((end - start) * 10) / 10
      : null
  );

  const syncPerformanceSnapshot = (tabId: string, shouldLog = false) => {
    const session = performanceSessionsRef.current[tabId];
    if (!session) {
      return;
    }

    const snapshot: PerformanceSnapshot = {
      trigger: session.trigger,
      sourceLabel: session.sourceLabel,
      fileSizeBytes: session.fileSizeBytes,
      rawBytes: session.rawBytes,
      formattedBytes: session.formattedBytes,
      largeMode: session.largeMode,
      structureEnabled: session.structureEnabled,
      readFileMs: measureDuration(session.readStartedAt, session.readCompletedAt),
      leftModelSyncMs: measureDuration(session.leftModelStartedAt, session.leftModelCompletedAt),
      formatQueueMs: measureDuration(session.formatQueuedAt, session.formatStartedAt),
      formatWorkerMs: measureDuration(session.formatStartedAt, session.formatCompletedAt),
      rightModelSyncMs: measureDuration(session.rightModelStartedAt, session.rightModelCompletedAt),
      totalToFormattedMs: measureDuration(session.startedAt, session.rightModelCompletedAt),
      structureIndexMs: measureDuration(session.formatCompletedAt, session.structureCompletedAt),
      updatedAt: Date.now(),
      status: session.status,
      error: session.error,
    };

    setPerformanceByTab((current) => ({ ...current, [tabId]: snapshot }));

    if (shouldLog) {
      logEvent('performance-snapshot', {
        tabId,
        snapshot,
      });
    }
  };

  const beginPerformanceSession = (
    tabId: string,
    trigger: PerformanceTrigger,
    sourceLabel: string,
    fileSizeBytes: number | null,
    rawBytes: number,
    largeMode: boolean
  ) => {
    performanceSessionsRef.current[tabId] = {
      requestId: null,
      pendingFormat: true,
      trigger,
      sourceLabel,
      fileSizeBytes,
      rawBytes,
      formattedBytes: 0,
      largeMode,
      structureEnabled: false,
      startedAt: performance.now(),
      status: 'running',
      error: null,
    };
    syncPerformanceSnapshot(tabId);
  };

  const mutatePerformanceSession = (
    tabId: string,
    mutate: (session: PerformanceSession) => void,
    shouldLog = false
  ) => {
    const session = performanceSessionsRef.current[tabId];
    if (!session) {
      return;
    }

    mutate(session);
    syncPerformanceSnapshot(tabId, shouldLog);
  };

  const clearPerformanceState = (tabId: string, removeOnly = false) => {
    delete performanceSessionsRef.current[tabId];
    setPerformanceByTab((current) => {
      const next = { ...current };
      if (removeOnly) {
        delete next[tabId];
      } else {
        next[tabId] = null;
      }
      return next;
    });
  };

  const attachEditorModel = (
    editor: monaco.editor.IStandaloneCodeEditor | null,
    model: monaco.editor.ITextModel,
    event: string,
    details: Record<string, unknown>
  ) => {
    if (!editor) {
      return;
    }

    if (editor.getModel() !== model) {
      editor.setModel(model);
      logEvent(event, details);
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
      attachEditorModel(leftEditorRef.current, model, 'left-model-attached', {
        tabId,
        path,
        rawLength: byteLength,
      });
    }
  };

  const syncRightModel = (tabId: string, content: string, forceValue = false) => {
    const path = getRightModelPath(tabId);
    const byteLength = getUtf8ByteLength(content);
    const language = getEditorLanguageByLength(byteLength);
    let model = getOrCreateModel(path, language);

    if (
      forceValue
      || model.getValueLength() !== content.length
      || model.getLanguageId() !== language
    ) {
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
      attachEditorModel(rightEditorRef.current, model, 'right-model-attached', {
        tabId,
        path,
        formattedLength: byteLength,
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

  const renameTab = (tabId: string, nextTitle: string) => {
    const trimmedTitle = nextTitle.trim() || DEFAULT_TAB_TITLE;
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, title: trimmedTitle }
          : tab
      )
    );
  };

  const queueFormat = (tabId: string, text: string, immediate = false) => {
    clearPendingFormat(tabId);
    setTabError(tabId, null);

    if (!text.trim()) {
      mutatePerformanceSession(tabId, (session) => {
        if (session.pendingFormat) {
          session.pendingFormat = false;
        }
        session.requestId = null;
        session.rawBytes = getUtf8ByteLength(text);
        session.formattedBytes = 0;
        session.status = 'ready';
        session.error = null;
      }, true);
      setTabFormatting(tabId, false);
      setTabLargeMode(tabId, false);
      workerStructureEnabledRef.current[tabId] = false;
      setStructureStatus(tabId, 'ready');
      rightTreesRef.current[tabId] = undefined;
      updateFormattedContent(tabId, '', true);
      return;
    }

    const largeMode = largeModeRef.current[tabId] || isLargeDocument(text);
    const workerStructureEnabled = canUseStructureSync(text) && Boolean(largeFileLocateEnabledRef.current[tabId]);
    if (largeModeRef.current[tabId] !== largeMode) {
      setTabLargeMode(tabId, largeMode);
    }
    setTabFormatting(tabId, true);
    workerStructureEnabledRef.current[tabId] = workerStructureEnabled;
    setStructureStatus(
      tabId,
      workerStructureEnabled ? 'building' : (largeMode ? 'disabled' : 'ready')
    );

    const requestId = ++requestCounterRef.current;
    latestRequestRef.current[tabId] = requestId;
    mutatePerformanceSession(tabId, (session) => {
      if (!session.pendingFormat) {
        return;
      }

      session.pendingFormat = false;
      session.requestId = requestId;
      session.largeMode = largeMode;
      session.structureEnabled = workerStructureEnabled;
      session.formatQueuedAt = performance.now();
      session.formatStartedAt = undefined;
      session.formatCompletedAt = undefined;
      session.rightModelStartedAt = undefined;
      session.rightModelCompletedAt = undefined;
      session.structureCompletedAt = undefined;
      session.formattedBytes = 0;
      session.status = 'running';
      session.error = null;
    });
    logEvent('format-queued', {
      tabId,
      requestId,
      textLength: getUtf8ByteLength(text),
      immediate,
      largeMode,
      workerStructureEnabled,
    });

    const run = () => {
      mutatePerformanceSession(tabId, (session) => {
        if (session.requestId !== requestId) {
          return;
        }

        session.formatStartedAt = performance.now();
      });
      logEvent('format-start', {
        tabId,
        requestId,
        textLength: getUtf8ByteLength(text),
      });
      workerRef.current?.postMessage({
        type: 'format',
        requestId,
        tabId,
        text,
        enableStructure: workerStructureEnabled,
      });
    };

    if (immediate) {
      run();
      return;
    }

    formatTimersRef.current[tabId] = window.setTimeout(
      run,
      largeMode ? LARGE_FILE_FORMAT_DEBOUNCE_MS : FORMAT_DEBOUNCE_MS
    );
  };

  const queueFormatAfterImport = (tabId: string, text: string) => {
    clearPendingFormat(tabId);
    formatTimersRef.current[tabId] = window.setTimeout(() => {
      delete formatTimersRef.current[tabId];
      queueFormat(tabId, text, true);
    }, 0);
  };

  const resetTabArtifacts = (tabId: string) => {
    clearPendingFormat(tabId);
    clearPerformanceState(tabId);
    setTabImporting(tabId, null);
    setTabFormatting(tabId, false);
    setTabLargeMode(tabId, false);
    workerStructureEnabledRef.current[tabId] = false;
    workerRef.current?.postMessage({
      type: 'clear-structure',
      tabId,
    });
    setStructureStatus(tabId, 'ready');
    leftTreesRef.current[tabId] = undefined;
    rightTreesRef.current[tabId] = undefined;
    latestRequestRef.current[tabId] = 0;
    updateTabContent(tabId, '', true);
    updateFormattedContent(tabId, '', true);
    setTabError(tabId, null);
  };

  const removeTabArtifacts = (tabId: string) => {
    clearPendingFormat(tabId);
    clearPerformanceState(tabId, true);
    workerRef.current?.postMessage({
      type: 'clear-structure',
      tabId,
    });
    delete formatTimersRef.current[tabId];
    delete latestRequestRef.current[tabId];
    delete leftTreesRef.current[tabId];
    delete rightTreesRef.current[tabId];
    delete largeModeRef.current[tabId];
    delete largeFileLocateEnabledRef.current[tabId];
    delete structureStatusRef.current[tabId];
    delete workerStructureEnabledRef.current[tabId];

    delete rawTextByTabRef.current[tabId];
    delete formattedTextByTabRef.current[tabId];
    disposeModel(getLeftModelPath(tabId));
    disposeModel(getRightModelPath(tabId));

    setErrorsByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setImportingByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setIsFormattingByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setDocumentMetaByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setLargeModeByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setLargeFileLocateEnabledByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });

    setStructureStatusByTab((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
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
    logEvent('renderer-ready');
  }, []);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      logEvent('renderer-window-error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logEvent('renderer-unhandled-rejection', {
        reason: event.reason instanceof Error
          ? { message: event.reason.message, stack: event.reason.stack }
          : String(event.reason),
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/jsonParser.worker.js', import.meta.url),
      { type: 'module' }
    );

    workerRef.current = worker;
    worker.onerror = (event) => {
      logEvent('worker-error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };
    worker.onmessageerror = () => {
      logEvent('worker-message-error');
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { type, requestId, tabId } = event.data;

      if (type === 'format-result') {
        const { success, data, error } = event.data;
        const performanceSession = performanceSessionsRef.current[tabId];

        if (latestRequestRef.current[tabId] !== requestId) {
          return;
        }

        if (success && data) {
          const largeMode = isLargeDocument(data) || Boolean(largeModeRef.current[tabId]);
          const formatCompletedAt = performance.now();
          logEvent('format-success', {
            tabId,
            requestId,
            formattedLength: getUtf8ByteLength(data),
          });
          setTabFormatting(tabId, false);
          setTabLargeMode(tabId, largeMode);
          if (performanceSession?.requestId === requestId) {
            performanceSession.formatCompletedAt = formatCompletedAt;
            performanceSession.rightModelStartedAt = performance.now();
            performanceSession.formattedBytes = getUtf8ByteLength(data);
            performanceSession.largeMode = largeMode;
          }
          updateFormattedContent(tabId, data, true);
          if (performanceSession?.requestId === requestId) {
            performanceSession.rightModelCompletedAt = performance.now();
            performanceSession.status = performanceSession.structureEnabled ? 'running' : 'ready';
            performanceSession.error = null;
            syncPerformanceSnapshot(tabId, !performanceSession.structureEnabled);
          }
          rightTreesRef.current[tabId] = largeMode ? undefined : parseTree(data) ?? undefined;
          setTabError(tabId, null);
          return;
        }

        setTabFormatting(tabId, false);
        mutatePerformanceSession(tabId, (session) => {
          if (session.requestId !== requestId) {
            return;
          }

          session.formatCompletedAt = performance.now();
          session.status = 'failed';
          session.error = error ?? 'JSON parse failed';
        }, true);
        logEvent('format-failed', {
          tabId,
          requestId,
          error: error ?? 'JSON parse failed',
        });
        rightTreesRef.current[tabId] = undefined;
        updateFormattedContent(tabId, '', true);
        setTabError(tabId, error ?? 'JSON 解析失败');
        setStructureStatus(tabId, 'disabled');
        return;
      }

      if (type === 'structure-ready') {
        if (latestRequestRef.current[tabId] !== requestId) {
          return;
        }

        mutatePerformanceSession(tabId, (session) => {
          if (session.requestId !== requestId) {
            return;
          }

          session.structureCompletedAt = performance.now();
          session.status = 'ready';
        }, true);
        setStructureStatus(
          tabId,
          event.data.ready ? 'ready' : 'disabled'
        );
        return;
      }

      if (type === 'locate-result') {
        if (tabId !== activeTabIdRef.current) {
          return;
        }

        if (event.data.found && typeof event.data.startOffset === 'number' && typeof event.data.endOffset === 'number') {
          revealLeftRange(event.data.startOffset, event.data.endOffset);
        }
      }
    };

    return () => {
      Object.keys(formatTimersRef.current).forEach(clearPendingFormat);
      clearLeftHighlights();
      clearRightHighlights();
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

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
  ): monaco.editor.IStandaloneEditorConstructionOptions => ({
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    largeFileOptimizations: true,
    wordWrap: wrapLongLines ? 'on' : 'off',
    folding: enableStructuralFolding,
    showFoldingControls: enableStructuralFolding ? 'always' : 'never',
    foldingStrategy: 'indentation',
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
  });

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
          leftTreesRef.current[currentTabId] = largeMode
            ? undefined
            : parseTree(text) ?? undefined;
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

    editor.onDidDispose(() => {
      if (rightEditorRef.current === editor) {
        rightEditorRef.current = null;
      }
    });

    editor.onDidChangeCursorPosition((event) => {
      const currentTabId = activeTabIdRef.current;

      if (largeModeRef.current[currentTabId]) {
        return;
      }

      const rightTree = rightTreesRef.current[currentTabId];
      const leftTree = leftTreesRef.current[currentTabId];
      const leftEditor = leftEditorRef.current;
      const rightModel = editor.getModel();
      const leftModel = leftEditor?.getModel();

      if (
        !rightTree ||
        !leftTree ||
        !leftEditor ||
        !rightModel ||
        !leftModel ||
        (event.position.lineNumber === 1 && event.position.column === 1)
      ) {
        return;
      }

      const offset = rightModel.getOffsetAt(event.position);
      const location = getLocation(rightModel.getValue(), offset);
      const rightNode = findNodeAtLocation(rightTree, location.path);
      const leftNode = findNodeAtLocation(leftTree, location.path);

      if (!rightNode || !leftNode) {
        return;
      }

      revealLeftRange(leftNode.offset, leftNode.offset + leftNode.length);
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

      const requestId = ++locateRequestCounterRef.current;
      workerRef.current?.postMessage({
        type: 'locate',
        requestId,
        tabId: currentTabId,
        offset: model.getOffsetAt(position),
      });
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
        const rightTree = rightTreesRef.current[currentTabId];

        if (!model || !position || !rightTree || largeModeRef.current[currentTabId]) {
          return;
        }

        const offset = model.getOffsetAt(position);
        const location = getLocation(model.getValue(), offset);
        const node = findNodeAtLocation(rightTree, location.path);

        if (!node) {
          return;
        }

        const valueToCopy = node.type === 'string'
          ? String(node.value ?? '')
          : model.getValue().slice(node.offset, node.offset + node.length);

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
    leftTreesRef.current[activeTab.id] = largeMode
      ? undefined
      : parseTree(nextContent) ?? undefined;
    queueFormat(activeTab.id, nextContent);
  };

  const importJsonFile = async (tabId: string, file: File) => {
    const presumedLargeMode = file.size >= LARGE_FILE_THRESHOLD;

    try {
      beginPerformanceSession(
        tabId,
        'import',
        file.name,
        file.size,
        file.size,
        presumedLargeMode
      );
      logEvent('import-start', {
        tabId,
        fileName: file.name,
        fileSize: file.size,
      });
      setTabError(tabId, null);
      setTabImporting(tabId, file.name);
      setTabFormatting(tabId, false);
      renameTab(tabId, getFileName(file.name));
      setTabLargeMode(tabId, presumedLargeMode);
      setStructureStatus(tabId, presumedLargeMode ? 'disabled' : 'ready');
      workerStructureEnabledRef.current[tabId] = false;
      resetSearchState();

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      mutatePerformanceSession(tabId, (session) => {
        session.readStartedAt = performance.now();
      });
      const content = await file.text();
      const rawBytes = getUtf8ByteLength(content);
      mutatePerformanceSession(tabId, (session) => {
        session.readCompletedAt = performance.now();
        session.rawBytes = rawBytes;
      });
      logEvent('import-read-complete', {
        tabId,
        fileName: file.name,
        rawLength: rawBytes,
      });
      const largeMode = isLargeDocument(content) || presumedLargeMode;
      const workerStructureEnabled = canUseStructureSync(content)
        && Boolean(largeFileLocateEnabledRef.current[tabId]);

      mutatePerformanceSession(tabId, (session) => {
        session.leftModelStartedAt = performance.now();
        session.largeMode = largeMode;
        session.structureEnabled = workerStructureEnabled;
      });
      leftTreesRef.current[tabId] = largeMode
        ? undefined
        : parseTree(content) ?? undefined;
      updateTabContent(tabId, content, true);
      updateFormattedContent(tabId, '', true);
      mutatePerformanceSession(tabId, (session) => {
        session.leftModelCompletedAt = performance.now();
      });
      setTabLargeMode(tabId, largeMode);
      setTabFormatting(tabId, true);
      setTabImporting(tabId, null);
      workerStructureEnabledRef.current[tabId] = workerStructureEnabled;
      setStructureStatus(
        tabId,
        workerStructureEnabled ? 'building' : (largeMode ? 'disabled' : 'ready')
      );
      rightTreesRef.current[tabId] = undefined;
      queueFormatAfterImport(tabId, content);
    } catch (error) {
      mutatePerformanceSession(tabId, (session) => {
        session.status = 'failed';
        session.error = error instanceof Error ? error.message : String(error);
      }, true);
      logEvent('import-failed', {
        tabId,
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error),
      });
      setTabImporting(tabId, null);
      setTabFormatting(tabId, false);
      setTabError(
        tabId,
        error instanceof Error ? `导入失败：${error.message}` : '导入失败'
      );
    }
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
    leftTreesRef.current[activeTab.id] = largeMode
      ? undefined
      : parseTree(currentText) ?? undefined;
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
      leftTreesRef.current[activeTab.id] = largeMode
        ? undefined
        : parseTree(updated) ?? undefined;
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

    setLargeFileLocateEnabled(activeTab.id, enabled);

    if (!enabled) {
      workerStructureEnabledRef.current[activeTab.id] = false;
      setStructureStatus(
        activeTab.id,
        isLargeDocument(getTabContent(activeTab.id)) ? 'disabled' : 'ready'
      );
      workerRef.current?.postMessage({
        type: 'clear-structure',
        tabId: activeTab.id,
      });
      return;
    }

    if (!isLargeDocument(getTabContent(activeTab.id))) {
      workerStructureEnabledRef.current[activeTab.id] = false;
      setStructureStatus(activeTab.id, 'ready');
      return;
    }

    if (!canUseStructureSync(getTabContent(activeTab.id))) {
      setStructureStatus(activeTab.id, 'disabled');
      return;
    }

    queueFormat(activeTab.id, getTabContent(activeTab.id), true);
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
    const nextTab = createTab(nextId);

    setTabs((currentTabs) => [...currentTabs, nextTab]);
    rawTextByTabRef.current[nextId] = '';
    formattedTextByTabRef.current[nextId] = '';
    setDocumentMetaByTab((current) => ({ ...current, [nextId]: EMPTY_DOCUMENT_META }));
    setErrorsByTab((current) => ({ ...current, [nextId]: null }));
    setImportingByTab((current) => ({ ...current, [nextId]: null }));
    setIsFormattingByTab((current) => ({ ...current, [nextId]: false }));
    setLargeModeByTab((current) => ({ ...current, [nextId]: false }));
    setLargeFileLocateEnabledByTab((current) => ({ ...current, [nextId]: false }));
    setStructureStatusByTab((current) => ({ ...current, [nextId]: 'ready' }));
    setPerformanceByTab((current) => ({ ...current, [nextId]: null }));
    largeModeRef.current[nextId] = false;
    largeFileLocateEnabledRef.current[nextId] = false;
    structureStatusRef.current[nextId] = 'ready';
    workerStructureEnabledRef.current[nextId] = false;
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

  const finishRenaming = () => {
    if (!renamingTab) {
      return;
    }

    renameTab(renamingTab.id, renamingTab.value);
    setRenamingTab(null);
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
  const startRenamingTab = (tab: Tab) => {
    setRenamingTab({ id: tab.id, value: tab.title });
  };
  const handleRenamingChange = (value: string) => {
    setRenamingTab((current) => (current ? { ...current, value } : current));
  };
  const cancelRenaming = () => {
    setRenamingTab(null);
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
          height: 'calc(100% - 48px)',
        }}
      >
        <div
          style={{
            flex: 1,
            position: 'relative',
            borderRight: isDarkMode ? '1px solid #444' : '1px solid #ddd',
            overflow: 'hidden',
            overscrollBehavior: 'contain',
          }}
        >
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

        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            overscrollBehavior: 'contain',
          }}
        >
          <Editor
            onMount={handleRightMount}
            theme={isDarkMode ? 'vs-dark' : 'vs-light'}
            options={getMonacoOptions(isLargeFileMode, true, canUseRightPaneFolding)}
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
      </Split>
    </div>
  );
};

export default App;
