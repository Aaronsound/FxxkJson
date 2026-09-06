import { MAX_DIFFS, type JsonDiffEntry, type JsonDiffResult, type JsonDiffType } from './jsonDiff';

export interface ComparisonSnapshot {
  leftDuplicateKey?: string;
  rightDuplicateKey?: string;
  pageCount: number;
  total: number;
  counts: Record<JsonDiffType, number>;
  leftError: string | null;
  rightError: string | null;
  truncated: boolean;
}

// Own batches outside React state: append once, never flatten/copy old entries.
export function createComparisonBatches() {
  const pages: JsonDiffEntry[][] = [];
  let total = 0;
  const counts = { added: 0, removed: 0, changed: 0 };
  return {
    page: (index: number) => pages[index],
    // Filter only retained results; never imply that an unfinished comparison has no more matches.
    filter(type: JsonDiffType | 'all', path: string) {
      const query = path.trim();
      if (type === 'all' && !query) return { pages, total };
      const filtered: JsonDiffEntry[][] = [];
      let count = 0;
      for (const page of pages) {
        for (const entry of page) {
          if ((type !== 'all' && entry.type !== type) || !entry.pathText.includes(query)) continue;
          if (count % MAX_DIFFS === 0) filtered.push([]);
          filtered[filtered.length - 1].push(entry);
          count += 1;
        }
      }
      return { pages: filtered, total: count };
    },
    append(batch: JsonDiffResult): ComparisonSnapshot {
      if (batch.diffs.length) pages.push(batch.diffs);
      total += batch.diffs.length;
      for (const diff of batch.diffs) counts[diff.type] += 1;
      return {
        pageCount: pages.length,
        total,
        counts: { ...counts },
        leftError: batch.leftError,
        rightError: batch.rightError,
        leftDuplicateKey: batch.leftDuplicateKey,
        rightDuplicateKey: batch.rightDuplicateKey,
        truncated: batch.truncated,
      };
    },
  };
}
