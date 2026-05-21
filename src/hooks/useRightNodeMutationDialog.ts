import { useCallback, useRef, useState } from 'react';
import type { RightNodeMutationDialogState } from '../components/RightNodeMutationDialog';
import type { JsonEditPath } from '../types/jsonTool';
import { formatJsonPath } from '../utils/jsonPath';

type PendingResolver =
  | {
      mode: 'delete';
      resolve: (confirmed: boolean) => void;
    }
  | {
      mode: 'rename';
      resolve: (nextKey: string | null) => void;
    };

export function useRightNodeMutationDialog() {
  const [dialogState, setDialogState] = useState<RightNodeMutationDialogState | null>(null);
  const pendingResolverRef = useRef<PendingResolver | null>(null);

  const clearPending = useCallback(() => {
    pendingResolverRef.current = null;
    setDialogState(null);
  }, []);

  const requestDeleteNode = useCallback(
    (path: JsonEditPath, preview: string) =>
      new Promise<boolean>((resolve) => {
        pendingResolverRef.current = { mode: 'delete', resolve };
        setDialogState({
          mode: 'delete',
          pathText: formatJsonPath(path),
          preview,
        });
      }),
    []
  );

  const requestRenameKey = useCallback(
    (path: JsonEditPath, currentKey: string) =>
      new Promise<string | null>((resolve) => {
        pendingResolverRef.current = { mode: 'rename', resolve };
        setDialogState({
          mode: 'rename',
          currentKey,
          pathText: formatJsonPath(path),
        });
      }),
    []
  );

  const cancelMutationDialog = useCallback(() => {
    const pending = pendingResolverRef.current;
    if (pending?.mode === 'delete') {
      pending.resolve(false);
    } else if (pending?.mode === 'rename') {
      pending.resolve(null);
    }
    clearPending();
  }, [clearPending]);

  const confirmDeleteDialog = useCallback(() => {
    const pending = pendingResolverRef.current;
    if (pending?.mode === 'delete') {
      pending.resolve(true);
    }
    clearPending();
  }, [clearPending]);

  const confirmRenameDialog = useCallback(
    (nextKey: string) => {
      const pending = pendingResolverRef.current;
      if (pending?.mode === 'rename') {
        pending.resolve(nextKey);
      }
      clearPending();
    },
    [clearPending]
  );

  return {
    cancelMutationDialog,
    confirmDeleteDialog,
    confirmRenameDialog,
    dialogState,
    requestDeleteNode,
    requestRenameKey,
  };
}
