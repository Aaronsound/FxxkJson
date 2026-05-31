export interface RightPinnedPath {
  id: string;
  pathText: string;
  startOffset: number;
  endOffset: number;
  createdAt: number;
}

export function addRecentSearchTerm(current: string[], term: string, limit: number) {
  const normalized = term.trim();
  if (normalized.length < 2) {
    return current;
  }

  return [normalized, ...current.filter((item) => item !== normalized)].slice(0, limit);
}

export function upsertPinnedPath(current: RightPinnedPath[], pinnedPath: RightPinnedPath, limit: number) {
  return [pinnedPath, ...current.filter((item) => item.pathText !== pinnedPath.pathText)].slice(0, limit);
}
