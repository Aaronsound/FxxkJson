import { useEffect, useRef, useState } from 'react';
import type { JsonEditPath } from '../types/jsonTool';

export type EditJsonSession = {
  key: number;
  initialValue: string;
  mode: 'document' | 'node';
  path?: JsonEditPath;
};

export function useJsonEditSession() {
  const [editJsonSession, setEditJsonSession] = useState<EditJsonSession | null>(null);
  const [editJsonError, setEditJsonError] = useState<string | null>(null);
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

  const openDocumentEditSession = (initialValue: string) => {
    editJsonValueRef.current = initialValue;
    setEditJsonError(null);
    clearCopyLiteralNotice();
    setEditJsonSession({
      key: Date.now(),
      initialValue,
      mode: 'document',
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
      path,
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

  useEffect(() => () => {
    if (copyLiteralTimeoutRef.current !== null) {
      window.clearTimeout(copyLiteralTimeoutRef.current);
    }
  }, []);

  return {
    clearCopyLiteralNotice,
    closeEditJson,
    editJsonBusyLabel,
    editJsonError,
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
