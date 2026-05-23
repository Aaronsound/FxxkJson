import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

interface UseE2eTestBridgeArgs {
  activeTabIdRef: MutableRefObject<string>;
  importJsonText: (tabId: string, name: string, size: number, content: string) => Promise<void>;
}

type E2eBridgeWindow = Window & {
  __HANJSON_E2E_APP__?: {
    importText: (name: string, size: number, content: string) => Promise<void>;
  };
};

export function useE2eTestBridge({ activeTabIdRef, importJsonText }: UseE2eTestBridgeArgs) {
  useEffect(() => {
    const e2eWindow = window as E2eBridgeWindow;

    e2eWindow.__HANJSON_E2E_APP__ = {
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
  }, [activeTabIdRef, importJsonText]);
}
