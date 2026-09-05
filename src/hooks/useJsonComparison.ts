import { useCallback, useEffect, useRef, useState } from 'react';
import type { JsonCompareWorkerResponse, JsonDiffSide, JsonDiffValue } from '../utils/jsonDiff';
import { createComparisonBatches, type ComparisonSnapshot } from '../utils/jsonComparisonBatches';

export function useJsonComparison() {
  const workerRef = useRef<Worker | null>(null);
  const busyRef = useRef(false);
  const valueRequests = useRef(
    new Map<number, { resolve: (value: JsonDiffValue) => void; reject: (error: Error) => void }>()
  );
  const valueRequestId = useRef(0);
  const batches = useRef(createComparisonBatches());
  const getPage = useCallback((page: number) => batches.current.page(page), []);
  const [result, setResult] = useState<ComparisonSnapshot | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useCallback(() => {
    const worker = workerRef.current;
    workerRef.current = null;
    busyRef.current = false;
    worker?.terminate();
    for (const request of valueRequests.current.values()) request.reject(new Error('Comparison cancelled'));
    valueRequests.current.clear();
  }, []);
  const reset = useCallback(() => {
    stop();
    batches.current = createComparisonBatches();
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
          setError(message || 'Unknown comparison error');
          setIsComparing(false);
        };
        worker.onmessage = (event: MessageEvent<JsonCompareWorkerResponse>) => {
          if (workerRef.current !== worker) return;
          if ('error' in event.data) {
            fail(event.data.error);
            return;
          }
          if ('value' in event.data) {
            valueRequests.current.get(event.data.id)?.resolve(event.data.value);
            valueRequests.current.delete(event.data.id);
            return;
          }
          const batch = event.data.result;
          const snapshot = batches.current.append(batch);
          if (!batch.truncated && snapshot.total === 0) stop();
          busyRef.current = false;
          setResult(snapshot);
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

  const getValue = useCallback(
    (path: Array<string | number>, side: JsonDiffSide, offset: number, full = false) =>
      new Promise<JsonDiffValue>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error('No active comparison'));
          return;
        }
        const id = ++valueRequestId.current;
        valueRequests.current.set(id, { resolve, reject });
        try {
          worker.postMessage({ value: { id, path, side, offset, full } });
        } catch (error) {
          valueRequests.current.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }),
    []
  );

  useEffect(() => stop, [stop]);
  const releaseValues = useCallback(() => {
    for (const request of valueRequests.current.values()) request.reject(new Error('Value inspection closed'));
    valueRequests.current.clear();
    try {
      workerRef.current?.postMessage({ releaseValues: true });
    } catch (caught) {
      stop();
      setError(caught instanceof Error ? caught.message : String(caught));
      setIsComparing(false);
    }
  }, [stop]);
  return { result, isComparing, error, compare, reset, loadMore, getValue, getPage, releaseValues };
}
