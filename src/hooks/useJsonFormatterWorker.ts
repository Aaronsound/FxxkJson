import { useEffect, useRef, useState } from 'react';

type WorkerResponse = {
  success: boolean;
  data?: string;
  error?: string;
  requestId: number;
  tabId: string;
};

type UseJsonFormatterWorkerOptions = {
  initialTabId: string;
};

/**
 * JSON 格式化 Worker Hook：
 * 1. 负责创建/销毁 Worker；
 * 2. 通过 requestId 防止旧结果覆盖新输入；
 * 3. 按 tab 维护格式化结果。
 */
export function useJsonFormatterWorker({ initialTabId }: UseJsonFormatterWorkerOptions) {
  const workerRef = useRef<Worker | null>(null);
  const requestSeqRef = useRef(0);
  const latestRequestByTabRef = useRef<Record<string, number>>({});

  const [rightValues, setRightValues] = useState<Record<string, string>>({
    [initialTabId]: '',
  });
  const [workerError, setWorkerError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/jsonParser.worker.js', import.meta.url), {
      type: 'module',
    });

    // 让 Worker 运行时异常在渲染进程控制台可见，便于调试。
    worker.onerror = (event) => {
      console.error('[json-worker] 运行异常', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    worker.onmessageerror = (event) => {
      console.error('[json-worker] 消息反序列化失败', event.data);
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const payload = event.data;
      const latestId = latestRequestByTabRef.current[payload.tabId];

      // 旧请求返回，忽略
      if (latestId !== payload.requestId) {
        return;
      }

      if (payload.success && payload.data !== undefined) {
        setRightValues((prev) => ({ ...prev, [payload.tabId]: payload.data as string }));
        setWorkerError(null);
        return;
      }

      // 解析失败时同步打印到渲染进程控制台，便于在 DevTools 中定位问题。
      console.error('[json-worker] JSON 解析失败', {
        tabId: payload.tabId,
        requestId: payload.requestId,
        error: payload.error || 'JSON 解析失败',
      });

      setWorkerError(payload.error || 'JSON 解析失败');
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const ensureTabValue = (tabId: string) => {
    setRightValues((prev) => (tabId in prev ? prev : { ...prev, [tabId]: '' }));
  };

  const removeTabValue = (tabId: string) => {
    setRightValues((prev) => {
      const { [tabId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const clearTabValue = (tabId: string) => {
    setRightValues((prev) => ({ ...prev, [tabId]: '' }));
    setWorkerError(null);
  };

  const formatInWorker = (text: string, tabId: string) => {
    if (!text) {
      clearTabValue(tabId);
      return;
    }

    const worker = workerRef.current;
    if (!worker) {
      setWorkerError('格式化 Worker 未初始化');
      return;
    }

    const requestId = ++requestSeqRef.current;
    latestRequestByTabRef.current[tabId] = requestId;
    worker.postMessage({ raw: text, requestId, tabId });
  };

  return {
    rightValues,
    workerError,
    setWorkerError,
    ensureTabValue,
    removeTabValue,
    clearTabValue,
    formatInWorker,
  };
}
