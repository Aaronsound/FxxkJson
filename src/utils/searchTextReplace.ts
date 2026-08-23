import type { JsonSearchOptions } from '../types/jsonTool';
import { getSearchMatcher, isWholeWordMatch } from './searchTextCore';

function replaceExactTextSearchMatches(text: string, searchTerm: string, wholeWord: boolean, replacement: string) {
  let result = '';
  let copyStart = 0;
  let searchStart = 0;

  while (searchStart < text.length) {
    const start = text.indexOf(searchTerm, searchStart);
    if (start === -1) {
      break;
    }

    const end = start + searchTerm.length;
    searchStart = end;
    if (wholeWord && !isWholeWordMatch(text, start, end)) {
      continue;
    }

    result += text.slice(copyStart, start);
    result += replacement;
    copyStart = end;
  }

  return copyStart === 0 ? text : `${result}${text.slice(copyStart)}`;
}

export function replaceTextSearchMatches(
  text: string,
  searchTerm: string,
  options: JsonSearchOptions,
  replacement: string
) {
  if (!searchTerm) {
    return text;
  }

  if (!options.useRegex && options.matchCase) {
    return replaceExactTextSearchMatches(text, searchTerm, options.wholeWord, replacement);
  }

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
