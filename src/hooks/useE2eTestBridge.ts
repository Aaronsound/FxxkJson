import type { MutableRefObject } from 'react';
import { useEffect } from 'react';

interface UseE2eTestBridgeArgs {
  activeTabIdRef: MutableRefObject<string>;
  getFormattedContent: (tabId: string) => string;
  getTabContent: (tabId: string) => string;
  importJsonText: (tabId: string, name: string, size: number, content: string) => Promise<void>;
}

type E2eBridgeWindow = Window & {
  __HANJSON_E2E_APP__?: {
    getActiveFormattedFingerprint: () => { hash: number; length: number; lineBreaks: number };
    getActiveRawFingerprint: () => { hash: number; length: number; lineBreaks: number };
    importText: (name: string, size: number, content: string) => Promise<void>;
  };
};

function fingerprintText(text: string) {
  let hash = 2166136261;
  let lineBreaks = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash = Math.imul(hash ^ code, 16777619) >>> 0;
    if (code === 10) {
      lineBreaks += 1;
    }
  }
  return { hash, length: text.length, lineBreaks };
}

export function useE2eTestBridge({
  activeTabIdRef,
  getFormattedContent,
  getTabContent,
  importJsonText,
}: UseE2eTestBridgeArgs) {
  useEffect(() => {
    const e2eWindow = window as E2eBridgeWindow;

    e2eWindow.__HANJSON_E2E_APP__ = {
      getActiveFormattedFingerprint: () => fingerprintText(getFormattedContent(activeTabIdRef.current)),
      getActiveRawFingerprint: () => fingerprintText(getTabContent(activeTabIdRef.current)),
      importText: async (name, size, content) => {
        const tabId = activeTabIdRef.current;
        if (tabId) {
          await importJsonText(tabId, name, size, content);
        }
      },
    };

    return () => {
      delete e2eWindow.__HANJSON_E2E_APP__;
    };
  }, [activeTabIdRef, getFormattedContent, getTabContent, importJsonText]);
}
