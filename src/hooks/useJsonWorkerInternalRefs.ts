import { useRef } from 'react';
import { createJsonWorkerClient } from '../utils/jsonWorkerClient';

export function useJsonWorkerInternalRefs() {
  const workerRef = useRef<Worker | null>(null);
  const workerClientRef = useRef(createJsonWorkerClient(() => workerRef.current));
  const formatTimersRef = useRef<Record<string, number>>({});
  const formatWatchdogTimersRef = useRef<Record<string, number>>({});
  const latestRequestRef = useRef<Record<string, number>>({});
  const requestCounterRef = useRef(0);

  return {
    formatTimersRef,
    formatWatchdogTimersRef,
    latestRequestRef,
    requestCounterRef,
    workerClient: workerClientRef.current,
    workerRef,
  };
}
