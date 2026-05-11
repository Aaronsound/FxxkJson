export interface SearchDecorationWindowItem<T> {
  matchIndex: number;
  range: T;
}

export function getSearchDecorationWindow<T>(
  matches: T[],
  activeIndex: number,
  radius: number
): Array<SearchDecorationWindowItem<T>> {
  if (matches.length === 0 || radius < 0) {
    return [];
  }

  const normalizedIndex = Math.min(Math.max(activeIndex, 0), matches.length - 1);
  const maxDecorations = radius * 2 + 1;

  if (matches.length <= maxDecorations) {
    return matches.map((range, matchIndex) => ({ matchIndex, range }));
  }

  const startIndex = Math.max(
    0,
    Math.min(normalizedIndex - radius, matches.length - maxDecorations)
  );
  const endIndex = Math.min(matches.length, startIndex + maxDecorations);

  return matches.slice(startIndex, endIndex).map((range, index) => ({
    matchIndex: startIndex + index,
    range,
  }));
}
