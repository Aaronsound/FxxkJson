export {};

declare global {
  interface RuntimeLogSnapshot {
    path: string;
    content: string;
    truncated: boolean;
  }

  interface NativeJsonFile {
    path: string;
    name: string;
    size: number;
    content: string;
  }

  interface Window {
    electronAPI?: {
      appendLog: (payload: string) => Promise<string>;
      readRecentLog: (maxBytes?: number) => Promise<RuntimeLogSnapshot>;
      showLogFile: () => Promise<string>;
      openJsonFile: () => Promise<NativeJsonFile | null>;
    };
  }
}
