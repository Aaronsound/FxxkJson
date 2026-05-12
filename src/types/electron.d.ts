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
      clearLog: () => Promise<string>;
      showLogFile: () => Promise<string>;
      writeClipboardText: (text: string) => Promise<boolean>;
      openJsonFile: () => Promise<NativeJsonFile | null>;
    };
  }
}
