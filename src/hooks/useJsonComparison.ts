import { useCallback, useEffect, useRef, useState } from 'react';
import type { JsonCompareWorkerResponse, JsonDiffResult } from '../utils/jsonDiff';

export function useJsonComparison() {
  const workerRef = useRef<Worker | null>(null);
  const busyRef = useRef(false);
  const [result, setResult] = useState<JsonDiffResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useCallback(() => {
    const worker = workerRef.current;
    workerRef.current = null;
    busyRef.current = false;
    worker?.terminate();
  }, []);
  const reset = useCallback(() => {
    stop();
    setResult(null);
    setError(null);
    setIsComparing(false);
  }, [stop]);

  const compare = useCallback(
    (leftText: string, rightText: string) => {
      reset();
      setIsComparing(true);
      busyRef.current = true;
      try {
        const worker = new Worker(new URL('../workers/jsonCompare.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        const fail = (message: string) => {
          if (workerRef.current !== worker) return;
          stop();
          setError(message);
          setIsComparing(false);
        };
        worker.onmessage = (event: MessageEvent<JsonCompareWorkerResponse>) => {
          if (workerRef.current !== worker) return;
          if ('error' in event.data) {
            fail(event.data.error);
            return;
          }
          const batch = event.data.result;
          if (!batch.truncated) stop();
          busyRef.current = false;
          setResult((previous) => ({ ...batch, diffs: [...(previous?.diffs ?? []), ...batch.diffs] }));
          setIsComparing(false);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          fail(event.message);
        };
        worker.onmessageerror = () => fail('Unable to read comparison result');
        worker.postMessage({ leftText, rightText });
      } catch (caught) {
        stop();
        setError(caught instanceof Error ? caught.message : String(caught));
        setIsComparing(false);
      }
    },
    [reset, stop]
  );

  const loadMore = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || busyRef.current) return;
    busyRef.current = true;
    setIsComparing(true);
    try {
      worker.postMessage({ next: true });
    } catch (caught) {
      stop();
      setError(caught instanceof Error ? caught.message : String(caught));
      setIsComparing(false);
    }
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { result, isComparing, error, compare, reset, loadMore };
}
