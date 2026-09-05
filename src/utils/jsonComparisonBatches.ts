import type { JsonDiffEntry, JsonDiffResult, JsonDiffType } from './jsonDiff';

export interface ComparisonSnapshot {
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
        truncated: batch.truncated,
      };
    },
  };
}
