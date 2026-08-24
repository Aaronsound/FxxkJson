import type { LargeJsonSearchMatch } from '../types/jsonTool';

const SEARCH_MATCH_FIELD_COUNT = 6;

export function packSearchMatches(matches: LargeJsonSearchMatch[]) {
  const data = new Uint32Array(matches.length * SEARCH_MATCH_FIELD_COUNT);

  matches.forEach((match, index) => {
    const offset = index * SEARCH_MATCH_FIELD_COUNT;
    data[offset] = match.start;
    data[offset + 1] = match.end;
    data[offset + 2] = match.lineNumber;
    data[offset + 3] = match.lineStartOffset;
    data[offset + 4] = match.localStart;
    data[offset + 5] = match.localEnd;
  });

  return data;
}

export function unpackSearchMatches(data: Uint32Array | null | undefined): LargeJsonSearchMatch[] | null {
  if (!(data instanceof Uint32Array) || data.length % SEARCH_MATCH_FIELD_COUNT !== 0) {
    return null;
  }

  const matches = new Array<LargeJsonSearchMatch>(data.length / SEARCH_MATCH_FIELD_COUNT);
  for (let index = 0; index < matches.length; index += 1) {
    const offset = index * SEARCH_MATCH_FIELD_COUNT;
    matches[index] = {
      start: data[offset],
      end: data[offset + 1],
      lineNumber: data[offset + 2],
      lineStartOffset: data[offset + 3],
      localStart: data[offset + 4],
      localEnd: data[offset + 5],
      matchIndex: index,
    };
  }

  return matches;
}
