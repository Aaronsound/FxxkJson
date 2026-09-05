export const COMPARISON_BLOCK_SIZE = 10;
export const COMPARISON_ROW_ESTIMATE = 64;

export function comparisonBlockOffsets(count: number, heights: Map<number, number>) {
  const offsets = [0];
  for (let start = 0, block = 0; start < count; start += COMPARISON_BLOCK_SIZE, block += 1) {
    offsets.push(
      offsets[block] + (heights.get(block) ?? Math.min(COMPARISON_BLOCK_SIZE, count - start) * COMPARISON_ROW_ESTIMATE)
    );
  }
  return offsets;
}

export function comparisonBlockAt(offsets: number[], top: number) {
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const mid = (low + high + 1) >>> 1;
    if (offsets[mid] <= top) low = mid;
    else high = mid - 1;
  }
  return low;
}
