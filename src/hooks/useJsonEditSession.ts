import { useEffect, useRef, useState } from 'react';
import type { JsonEditPath } from '../types/jsonTool';
import { formatJsonPath } from '../utils/jsonPath';
import type { JsonErrorLocation } from '../utils/jsonErrorLocation';

export type EditJsonSession = {
  key: number;
  initialValue: string;
  mode: 'document' | 'node';
  rawSource?: boolean;
  path?: JsonEditPath;
  pathText?: string;
};

export function useJsonEditSession() {
  const [editJsonSession, setEditJsonSession] = useState<EditJsonSession | null>(null);
  const [editJsonError, setErrorMessage] = useState<string | null>(null);
  const [editJsonErrorLocation, setErrorLocation] = useState<JsonErrorLocation | undefined>();
  const setEditJsonError = (message: string | null, location?: JsonErrorLocation) => {
    setErrorMessage(message);
    setErrorLocation(location);
  };
  const [editJsonBusyLabel, setEditJsonBusyLabel] = useState<string | null>(null);
  const [hasCopiedLiteral, setHasCopiedLiteral] = useState(false);
  const editJsonValueRef = useRef('');
  const copyLiteralTimeoutRef = useRef<number | null>(null);

  const clearCopyLiteralNotice = () => {
    if (copyLiteralTimeoutRef.current !== null) {
      window.clearTimeout(copyLiteralTimeoutRef.current);
      copyLiteralTimeoutRef.current = null;
    }
    setHasCopiedLiteral(false);
  };

  const openDocumentEditSession = (initialValue: string, location?: JsonErrorLocation) => {
    editJsonValueRef.current = initialValue;
    setEditJsonError(null);
    setErrorLocation(location);
    clearCopyLiteralNotice();
    setEditJsonSession({
      key: Date.now(),
      initialValue,
      mode: 'document',
      rawSource: Boolean(location),
    });
  };

  const openNodeEditSession = (initialValue: string, path: JsonEditPath) => {
    editJsonValueRef.current = initialValue;
    setEditJsonError(null);
    clearCopyLiteralNotice();
    setEditJsonSession({
      key: Date.now(),
      initialValue,
      mode: 'node',
      path: [...path],
      pathText: formatJsonPath(path),
    });
  };

  const closeEditJson = () => {
    setEditJsonSession(null);
    setEditJsonError(null);
    setEditJsonBusyLabel(null);
    clearCopyLiteralNotice();
  };

  const showCopyLiteralNotice = () => {
    clearCopyLiteralNotice();
    setHasCopiedLiteral(true);
    copyLiteralTimeoutRef.current = window.setTimeout(() => {
      setHasCopiedLiteral(false);
      copyLiteralTimeoutRef.current = null;
    }, 2000);
  };

  useEffect(
    () => () => {
      if (copyLiteralTimeoutRef.current !== null) {
        window.clearTimeout(copyLiteralTimeoutRef.current);
      }
    },
    []
  );

  return {
    clearCopyLiteralNotice,
    closeEditJson,
    editJsonBusyLabel,
    editJsonError,
    editJsonErrorLocation,
    editJsonSession,
    editJsonValueRef,
    hasCopiedLiteral,
    openDocumentEditSession,
    openNodeEditSession,
    setEditJsonBusyLabel,
    setEditJsonError,
    showCopyLiteralNotice,
  };
}
