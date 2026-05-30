import type { JsonSearchOptions } from '../types/jsonTool';
import { getSearchMatcher, isWholeWordMatch } from './searchTextCore';

export function replaceTextSearchMatches(
  text: string,
  searchTerm: string,
  options: JsonSearchOptions,
  replacement: string
) {
  const matcher = getSearchMatcher(searchTerm, options);
  if (!matcher) {
    return text;
  }

  let result = '';
  let copyStart = 0;
  let match: RegExpExecArray | null;
  const replacementMatcher = options.useRegex ? new RegExp(searchTerm, options.matchCase ? '' : 'i') : null;

  while ((match = matcher.exec(text)) !== null) {
    const start = match.index;
    const value = match[0];
    const end = start + value.length;

    if (value.length === 0) {
      matcher.lastIndex += 1;
      continue;
    }

    if (options.wholeWord && !isWholeWordMatch(text, start, end)) {
      continue;
    }

    result += text.slice(copyStart, start);
    result += replacementMatcher ? value.replace(replacementMatcher, replacement) : replacement;
    copyStart = end;
  }

  return copyStart === 0 ? text : `${result}${text.slice(copyStart)}`;
}
