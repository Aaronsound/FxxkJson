import type { LargeJsonViewerRegions } from '../types/jsonTool';
import { findLastRegionIndexStartingAtOrBefore } from './largeJsonViewerData';

function findDeepestContainingRegionIndex(regions: LargeJsonViewerRegions, lineNumber: number) {
  let index = findLastRegionIndexStartingAtOrBefore(regions, lineNumber);

  while (index >= 0) {
    if (regions.endLines[index] >= lineNumber) {
      return index;
    }
    index = regions.parentIndexes[index];
  }

  return -1;
}

export function getRegionFoldTargets(regions: LargeJsonViewerRegions, lineNumber: number) {
  const deepestIndex = findDeepestContainingRegionIndex(regions, lineNumber);
  const currentIndex = deepestIndex >= 0 && regions.startLines[deepestIndex] === lineNumber ? deepestIndex : -1;
  let parentIndex = currentIndex >= 0 ? regions.parentIndexes[currentIndex] : deepestIndex;

  while (parentIndex >= 0 && regions.startLines[parentIndex] === lineNumber) {
    parentIndex = regions.parentIndexes[parentIndex];
  }

  const currentLine = currentIndex >= 0 ? regions.startLines[currentIndex] : null;
  const parentLine = parentIndex >= 0 ? regions.startLines[parentIndex] : null;

  return {
    currentLine,
    parentLine,
    nearestLine: currentLine ?? parentLine,
  };
}

export function findNearestRegionStartLine(regions: LargeJsonViewerRegions, lineNumber: number) {
  return getRegionFoldTargets(regions, lineNumber).nearestLine;
}
