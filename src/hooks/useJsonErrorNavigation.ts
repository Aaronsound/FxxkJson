import { useCallback, useEffect, useRef } from 'react';
import { getErrorHighlightRange, type JsonErrorLocation } from '../utils/jsonErrorLocation';

interface Args {
  activeTabId: string;
  rawRevision: number;
  error: string | null;
  location?: JsonErrorLocation;
  getRawRevision: (tabId: string) => number;
  getTabContent: (tabId: string) => string;
  revealLeftRange: (start: number, end: number) => void;
  clearLeftHighlights: () => void;
  focusLeft: () => void;
}

export function useJsonErrorNavigation({
  activeTabId,
  rawRevision,
  error,
  location,
  getRawRevision,
  getTabContent,
  revealLeftRange,
  clearLeftHighlights,
  focusLeft,
}: Args) {
  const located = useRef(false);
  const currentErrorLocation = error && location?.rawRevision === rawRevision ? location : undefined;
  useEffect(() => {
    void activeTabId;
    void rawRevision;
    void currentErrorLocation;
    return () => {
      if (located.current) clearLeftHighlights();
      located.current = false;
    };
  }, [activeTabId, rawRevision, currentErrorLocation, clearLeftHighlights]);
  const handleLocateError = useCallback(() => {
    if (!currentErrorLocation || getRawRevision(activeTabId) !== currentErrorLocation.rawRevision) return;
    const range = getErrorHighlightRange(getTabContent(activeTabId), currentErrorLocation);
    located.current = true;
    revealLeftRange(range.start, range.end);
    focusLeft();
  }, [activeTabId, currentErrorLocation, getRawRevision, getTabContent, revealLeftRange, focusLeft]);
  return { currentErrorLocation, handleLocateError };
}
