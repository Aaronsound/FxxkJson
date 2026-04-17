export {};

declare global {
  interface Window {
    electronAPI?: {
      appendLog: (payload: string) => Promise<string>;
    };
  }
}
