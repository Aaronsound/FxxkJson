import type { MutableRefObject } from 'react';
import { LARGE_FILE_THRESHOLD } from '../types/jsonTool';
import type { ProcessingStage, StructureStatus } from '../types/jsonTool';
import type { PerformanceSession } from './useJsonPerformanceTracking';
import { getUtf8ByteLength } from '../utils/jsonDocumentMetrics';
import { getFileName } from '../utils/jsonToolModels';
import { buildJsonWorkerProcessingPlan } from '../utils/jsonWorkerPlan';

interface JsonImportSource {
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
  updateFormattedContent: (tabId: string, content: string, syncModel?: boolean) => void;
  updateTabContent: (tabId: string, content: string, syncModel?: boolean) => void;
}

interface JsonWorkerImportFlowArgs {
  cancelInteractiveRequests: (tabId: string) => void;
  getCallbacks: () => JsonWorkerImportCallbacks;
  largeFileLocateEnabledRef: MutableRefObject<Record<string, boolean>>;
  postClearStructure: (tabId: string) => void;
  queueFormatAfterImport: (tabId: string, text: string) => void;
  workerStructureEnabledRef: MutableRefObject<Record<string, boolean>>;
}

export function createJsonWorkerImportFlow({
  cancelInteractiveRequests,
  getCallbacks,
  largeFileLocateEnabledRef,
  postClearStructure,
  queueFormatAfterImport,
  workerStructureEnabledRef,
}: JsonWorkerImportFlowArgs) {
  const importJsonSource = async (tabId: string, source: JsonImportSource) => {
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
      postClearStructure(tabId);
      callbacks.resetSearchState();

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });

      callbacks.mutatePerformanceSession(tabId, (session) => {
        session.readStartedAt = performance.now();
      });
      const content = await source.readText();
      const rawBytes = getUtf8ByteLength(content);
      callbacks.mutatePerformanceSession(tabId, (session) => {
        session.readCompletedAt = performance.now();
        session.rawBytes = rawBytes;
      });
      callbacks.logEvent('import-read-complete', {
        tabId,
        fileName: source.name,
        rawLength: rawBytes,
      });
      const plan = buildJsonWorkerProcessingPlan(content, Boolean(largeFileLocateEnabledRef.current[tabId]));

      callbacks.mutatePerformanceSession(tabId, (session) => {
        session.leftModelStartedAt = performance.now();
        session.largeMode = plan.largeMode;
        session.structureEnabled = plan.workerLocateEnabled;
      });
      callbacks.setProcessingStage(tabId, 'syncing-left');
      callbacks.updateTabContent(tabId, content, true);
      callbacks.updateFormattedContent(tabId, '', true);
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
      queueFormatAfterImport(tabId, content);
    } catch (error) {
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
    }
  };

  return {
    importJsonFile: async (tabId: string, file: File) =>
      importJsonSource(tabId, {
        name: file.name,
        size: file.size,
        readText: () => file.text(),
      }),
    importJsonText: async (tabId: string, name: string, size: number, content: string) =>
      importJsonSource(tabId, {
        name,
        size,
        readText: async () => content,
      }),
  };
}
