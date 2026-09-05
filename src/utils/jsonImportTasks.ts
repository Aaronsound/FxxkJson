export interface JsonImportTask {
  isCurrent: () => boolean;
  finish: () => void;
}

/** Share task identity across native file picking, file reads, and tab cleanup. */
export function createJsonImportTasks() {
  const tasks = new Map<string, object>();
  return {
    begin(tabId: string): JsonImportTask {
      const token = {};
      tasks.set(tabId, token);
      return {
        isCurrent: () => tasks.get(tabId) === token,
        finish: () => {
          if (tasks.get(tabId) === token) tasks.delete(tabId);
        },
      };
    },
    cancel: (tabId: string) => tasks.delete(tabId),
    clear: () => tasks.clear(),
  };
}
