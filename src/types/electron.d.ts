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
    contentBuffer: ArrayBuffer;
  }

  interface RuntimeAppInfo {
    arch: string;
    isMacTranslated: boolean;
    isPackaged: boolean;
    platform: string;
  }

  interface RuntimeProcessMetric {
    memory: {
      peakWorkingSetSize: number;
      workingSetSize: number;
    };
    name: string | null;
    pid: number;
    type: string;
  }

  interface Window {
    electronAPI?: {
      appendLog: (payload: string) => Promise<string>;
      readRecentLog: (maxBytes?: number) => Promise<RuntimeLogSnapshot>;
      clearLog: () => Promise<string>;
      showLogFile: () => Promise<string>;
      readClipboardText?: () => Promise<string>;
      writeClipboardText: (text: string) => Promise<boolean>;
      getRuntimeInfo?: () => Promise<RuntimeAppInfo>;
      getProcessMetrics?: () => Promise<RuntimeProcessMetric[]>;
      openJsonFile: (
        onSelected?: (metadata: Omit<NativeJsonFile, 'content' | 'contentBuffer'>) => void
      ) => Promise<NativeJsonFile | null>;
      onFindShortcut?: (callback: () => void) => () => void;
    };
  }
}
