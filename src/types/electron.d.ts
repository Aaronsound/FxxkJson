export {};

declare global {
  interface RuntimeLogSnapshot {
    path: string;
    content: string;
    truncated: boolean;
  }

  interface Window {
    electronAPI?: {
      appendLog: (payload: string) => Promise<string>;
      readRecentLog: (maxBytes?: number) => Promise<RuntimeLogSnapshot>;
      showLogFile: () => Promise<string>;
    };
  }
}
