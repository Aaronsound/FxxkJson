import { useCallback, useMemo, useState } from 'react';
import type { RightNodeSelection } from '../types/jsonTool';
import {
  addRecentSearchTerm,
  upsertPinnedPath,
} from '../utils/searchQuickAccess';
import type { RightPinnedPath } from '../utils/searchQuickAccess';

const RIGHT_RECENT_SEARCHES_STORAGE_KEY = 'hanjson.rightSearch.recent.v1';
const MAX_RECENT_SEARCHES = 8;
const MAX_PINNED_PATHS = 16;
const MAX_HEADER_PATH_LENGTH = 120;

export function getCompactPathLabel(pathText: string) {
  return pathText.length > MAX_HEADER_PATH_LENGTH
    ? `${pathText.slice(0, MAX_HEADER_PATH_LENGTH - 3)}...`
    : pathText;
}

function readStoredStringList(key: string) {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeStoredStringList(key: string, values: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(values));
}

export function useRightSearchQuickAccess(activeTabId: string | null) {
  const [rightRecentSearches, setRightRecentSearches] = useState<string[]>(() => (
    readStoredStringList(RIGHT_RECENT_SEARCHES_STORAGE_KEY).slice(0, MAX_RECENT_SEARCHES)
  ));
  const [rightPinnedPathsByTab, setRightPinnedPathsByTab] = useState<Record<string, RightPinnedPath[]>>({});

  const activeRightPinnedPaths = activeTabId
    ? rightPinnedPathsByTab[activeTabId] ?? []
    : [];
  const activeRightPinnedPathItems = useMemo(() => activeRightPinnedPaths.map((item) => ({
    id: item.id,
    label: getCompactPathLabel(item.pathText),
    detail: item.pathText,
  })), [activeRightPinnedPaths]);

  const rememberRightSearchTerm = useCallback((term: string) => {
    setRightRecentSearches((current) => {
      const next = addRecentSearchTerm(current, term, MAX_RECENT_SEARCHES);
      writeStoredStringList(RIGHT_RECENT_SEARCHES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const pinRightPath = useCallback((tabId: string, selection: RightNodeSelection | null) => {
    if (!selection?.pathText) {
      return;
    }

    const pinnedPath: RightPinnedPath = {
      id: `${selection.pathText}:${selection.startOffset}`,
      pathText: selection.pathText,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      createdAt: Date.now(),
    };

    setRightPinnedPathsByTab((current) => {
      const existing = current[tabId] ?? [];
      const next = upsertPinnedPath(existing, pinnedPath, MAX_PINNED_PATHS);

      return {
        ...current,
        [tabId]: next,
      };
    });
  }, []);

  const getPinnedPath = useCallback((tabId: string, id: string) => (
    (rightPinnedPathsByTab[tabId] ?? []).find((item) => item.id === id) ?? null
  ), [rightPinnedPathsByTab]);

  return {
    activeRightPinnedPathItems,
    getPinnedPath,
    pinRightPath,
    rememberRightSearchTerm,
    rightRecentSearches,
  };
}
