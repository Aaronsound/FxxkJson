export function createJsonWorkerStructureOperations(args: {
  directValueTreeCache: Map<string, { requestId: number; formattedTree: unknown }>;
  directValueWarmupTimers: Map<string, ReturnType<typeof setTimeout>>;
  deferredStructureWarmupTimers: Map<string, ReturnType<typeof setTimeout>>;
  latestFormatRequestByTab: Map<string, number>;
  structureCache: Map<string, Record<string, unknown>>;
  viewerCache: Map<string, Record<string, unknown>>;
}): {
  clearDeferredStructureWarmup(tabId: string): void;
  clearDirectValueWarmup(tabId: string): void;
  ensureStructureTrees(tabId: string, cached: Record<string, unknown> | null | undefined): boolean;
  getDirectValueTree(tabId: string, requestId: number, text: string): unknown;
  getStructureWarmupDelayForTexts(
    rawText: string | null | undefined,
    formattedText: string | null | undefined,
    baseDelayMs: number
  ): number;
  scheduleDeferredStructureWarmup(tabId: string, requestId: number, delayMs?: number): void;
  scheduleDirectValueTreeWarmup(tabId: string, requestId: number, text: string): void;
};
