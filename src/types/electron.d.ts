export {};

declare global {
  interface Window {
    electronAPI?: {
      selectJsonFile: () => Promise<string | null>;
      readJsonFile: (filePath: string) => Promise<string>;
    };
  }
}
