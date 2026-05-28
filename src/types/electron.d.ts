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

  interface RuntimeAppInfo {
    arch: string;
    isMacTranslated: boolean;
    isPackaged: boolean;
    platform: string;
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
      openJsonFile: () => Promise<NativeJsonFile | null>;
      onFindShortcut?: (callback: () => void) => () => void;
    };
  }
}
