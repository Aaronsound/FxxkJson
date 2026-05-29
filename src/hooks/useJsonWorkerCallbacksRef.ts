import { useRef } from 'react';
import type { UseJsonFormattingWorkerArgs } from './useJsonFormattingWorker';

type JsonWorkerCallbackKeys =
  | 'beginPerformanceSession'
  | 'clearLeftHighlights'
  | 'clearPerformanceState'
  | 'clearRightHighlights'
  | 'logEvent'
  | 'mutatePerformanceSession'
  | 'removeTabState'
  | 'renameTab'
  | 'resetSearchState'
  | 'revealLeftRange'
  | 'setStructureStatus'
  | 'setTabError'
  | 'setTabFormatting'
  | 'setTabImporting'
  | 'setTabLargeMode'
  | 'setProcessingStage'
  | 'setLocateFeedback'
  | 'setRightNodeSelection'
  | 'setLargeViewerData'
  | 'setLargeRawViewerData'
  | 'setLeftSearchResults'
  | 'setLargeViewerSearchResults'
  | 'setLargeViewerStatus'
  | 'syncPerformanceSnapshot'
  | 'updateFormattedContent'
  | 'updateTabContent';

export type JsonWorkerCallbacks = Pick<UseJsonFormattingWorkerArgs, JsonWorkerCallbackKeys>;

export function useJsonWorkerCallbacksRef(callbacks: JsonWorkerCallbacks) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  return callbacksRef;
}
