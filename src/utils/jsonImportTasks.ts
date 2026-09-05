export interface JsonImportTask {
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => void;
}

/** Share task identity across native file picking, file reads, and tab cleanup. */
export function createJsonImportTasks() {
  const tasks = new Map<string, AbortController>();
  const cancel = (tabId: string) => {
    const controller = tasks.get(tabId);
    tasks.delete(tabId);
    controller?.abort();
  };
  return {
    begin(tabId: string): JsonImportTask {
      cancel(tabId);
      const token = new AbortController();
      tasks.set(tabId, token);
      return {
        signal: token.signal,
        isCurrent: () => tasks.get(tabId) === token,
        finish: () => {
          if (tasks.get(tabId) === token) tasks.delete(tabId);
        },
      };
    },
    cancel,
    clear: () => {
      const controllers = [...tasks.values()];
      tasks.clear();
      for (const controller of controllers) controller.abort();
    },
  };
}
