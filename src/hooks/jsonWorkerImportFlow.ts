import type { MutableRefObject } from 'react';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type { ProcessingStage, StructureStatus } from '../types/jsonTool';
import type { PerformanceSession } from './useJsonPerformanceTracking';
import { measureJsonDocumentWithKnownByteLength } from '../utils/jsonDocumentMetrics';
import { getFileName } from '../utils/jsonToolModels';
import { buildJsonWorkerProcessingPlan } from '../utils/jsonWorkerPlan';
import { createJsonImportTasks, type JsonImportTask } from '../utils/jsonImportTasks';

interface JsonImportSource {
  contentBuffer?: ArrayBuffer;
  name: string;
  size: number;
  readText: () => Promise<string>;
}

interface JsonWorkerImportCallbacks {
  beginPerformanceSession: (
    tabId: string,
    trigger: 'import',
    sourceLabel: string,
    fileSizeBytes: number,
    rawBytes: number,
    largeMode: boolean
  ) => void;
  logEvent: (event: string, details?: Record<string, unknown>) => void;
  mutatePerformanceSession: (tabId: string, mutate: (session: PerformanceSession) => void, shouldLog?: boolean) => void;
  renameTab: (tabId: string, nextTitle: string) => void;
  resetSearchState: () => void;
  setLargeRawViewerData: (tabId: string, data: null) => void;
  setLargeViewerData: (tabId: string, data: null) => void;
  setLargeViewerStatus: (tabId: string, status: 'idle') => void;
  setLocateFeedback: (tabId: string, feedback: null) => void;
  setProcessingStage: (tabId: string, stage: ProcessingStage) => void;
  setStructureStatus: (tabId: string, status: StructureStatus) => void;
  setTabError: (tabId: string, message: string | null) => void;
  setTabFormatting: (tabId: string, formatting: boolean) => void;
  setTabImporting: (tabId: string, fileName: string | null) => void;
  setTabLargeMode: (tabId: string, enabled: boolean) => void;
  updateFormattedContent: (
    tabId: string,
    content: string,
    syncModel?: boolean,
    byteLength?: number,
    rawByteLength?: number
  ) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean, byteLength?: number) => void;
}

interface JsonWorkerImportFlowArgs {
  cancelInteractiveRequests: (tabId: string) => void;
  getCallbacks: () => JsonWorkerImportCallbacks;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  postClearTabCache: (tabId: string) => void;
  queueFormatAfterImport: (
    tabId: string,
    text: string,
    plan?: ReturnType<typeof buildJsonWorkerProcessingPlan>,
    textBuffer?: ArrayBuffer
  ) => void;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
}

export function createJsonWorkerImportFlow({
  cancelInteractiveRequests,
  getCallbacks,
  largeFileLocateEnabledRef,
  postClearTabCache,
  queueFormatAfterImport,
  workerStructureEnabledRef,
}: JsonWorkerImportFlowArgs) {
  const tasks = createJsonImportTasks();
  const importJsonSource = async (tabId: string, source: JsonImportSource, task = tasks.begin(tabId)) => {
    if (!task.isCurrent()) return;
    const callbacks = getCallbacks();
    const presumedLargeMode = source.size >= LARGE_FILE_THRESHOLD;

    try {
      callbacks.beginPerformanceSession(tabId, 'import', source.name, source.size, source.size, presumedLargeMode);
      callbacks.logEvent('import-start', {
        tabId,
        fileName: source.name,
        fileSize: source.size,
      });
      callbacks.setTabError(tabId, null);
      callbacks.setTabImporting(tabId, source.name);
      callbacks.setTabFormatting(tabId, false);
      callbacks.setProcessingStage(tabId, 'reading');
      callbacks.setLocateFeedback(tabId, null);
      callbacks.renameTab(tabId, getFileName(source.name));
      callbacks.setTabLargeMode(tabId, presumedLargeMode);
      callbacks.setLargeViewerStatus(tabId, 'idle');
      callbacks.setLargeViewerData(tabId, null);
      callbacks.setLargeRawViewerData(tabId, null);
      callbacks.setStructureStatus(tabId, presumedLargeMode ? 'disabled' : 'ready');
      workerStructureEnabledRef.current[tabId] = false;
      cancelInteractiveRequests(tabId);
      postClearTabCache(tabId);
      callbacks.resetSearchState();

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });

      if (!task.isCurrent()) return;

      callbacks.mutatePerformanceSession(tabId, (session) => {
        session.readStartedAt = performance.now();
      });
      const content = await source.readText();
      if (!task.isCurrent()) return;
      const rawBytes = source.size;
      const metrics = measureJsonDocumentWithKnownByteLength(content, rawBytes);
      callbacks.mutatePerformanceSession(tabId, (session) => {
        session.readCompletedAt = performance.now();
        session.rawBytes = rawBytes;
      });
      callbacks.logEvent('import-read-complete', {
        tabId,
        fileName: source.name,
        rawLength: rawBytes,
      });
      const plan = buildJsonWorkerProcessingPlan(content, Boolean(largeFileLocateEnabledRef.current[tabId]), metrics);

      callbacks.mutatePerformanceSession(tabId, (session) => {
        session.leftModelStartedAt = performance.now();
        session.largeMode = plan.largeMode;
        session.structureEnabled = plan.workerLocateEnabled;
      });
      callbacks.setProcessingStage(tabId, 'syncing-left');
      callbacks.updateTabContent(tabId, content, true, rawBytes);
      callbacks.updateFormattedContent(tabId, '', true, 0, rawBytes);
      callbacks.mutatePerformanceSession(tabId, (session) => {
        session.leftModelCompletedAt = performance.now();
      });
      callbacks.setTabLargeMode(tabId, plan.largeMode);
      callbacks.setTabFormatting(tabId, true);
      callbacks.setTabImporting(tabId, null);
      callbacks.setProcessingStage(tabId, 'formatting');
      workerStructureEnabledRef.current[tabId] = plan.workerLocateEnabled;
      callbacks.setStructureStatus(
        tabId,
        plan.workerLocateEnabled ? 'building' : plan.largeMode ? 'disabled' : 'ready'
      );
      if (source.contentBuffer && source.contentBuffer.byteLength === plan.textByteLength) {
        queueFormatAfterImport(tabId, content, plan, source.contentBuffer);
      } else {
        queueFormatAfterImport(tabId, content, plan);
      }
    } catch (error) {
      if (!task.isCurrent()) return;
      callbacks.mutatePerformanceSession(
        tabId,
        (session) => {
          session.status = 'failed';
          session.error = error instanceof Error ? error.message : String(error);
        },
        true
      );
      callbacks.logEvent('import-failed', {
        tabId,
        fileName: source.name,
        error: error instanceof Error ? error.message : String(error),
      });
      callbacks.setTabImporting(tabId, null);
      callbacks.setTabFormatting(tabId, false);
      callbacks.setProcessingStage(tabId, 'idle');
      callbacks.setLocateFeedback(tabId, null);
      callbacks.setLargeViewerStatus(tabId, 'idle');
      callbacks.setLargeViewerData(tabId, null);
      callbacks.setLargeRawViewerData(tabId, null);
      callbacks.setTabError(tabId, error instanceof Error ? `导入失败：${error.message}` : '导入失败');
    } finally {
      task.finish();
    }
  };

  return {
    beginImport: tasks.begin,
    cancelImport: tasks.cancel,
    cancelAllImports: tasks.clear,
    importJsonFile: async (tabId: string, file: File) =>
      importJsonSource(tabId, {
        name: file.name,
        size: file.size,
        readText: () => file.text(),
      }),
    importJsonText: async (
      tabId: string,
      name: string,
      size: number,
      content: string,
      contentBuffer?: ArrayBuffer,
      task?: JsonImportTask
    ) =>
      importJsonSource(
        tabId,
        {
          contentBuffer,
          name,
          size,
          readText: async () => content,
        },
        task
      ),
  };
}
