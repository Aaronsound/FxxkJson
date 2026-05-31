import type { LargeJsonViewerRegion } from '../types/jsonTool';

function findDeepestContainingRegion(
  regions: LargeJsonViewerRegion[],
  lineNumber: number,
  shouldInclude: (region: LargeJsonViewerRegion) => boolean
) {
  let deepestRegion: LargeJsonViewerRegion | null = null;

  for (const region of regions) {
    if (lineNumber < region.startLine || lineNumber > region.endLine || !shouldInclude(region)) {
      continue;
    }

    if (!deepestRegion || region.startLine >= deepestRegion.startLine) {
      deepestRegion = region;
    }
  }

  return deepestRegion;
}

export function getRegionFoldTargets(regions: LargeJsonViewerRegion[], lineNumber: number) {
  const currentRegion = findDeepestContainingRegion(regions, lineNumber, (region) => region.startLine === lineNumber);
  const parentRegion = findDeepestContainingRegion(regions, lineNumber, (region) => region.startLine < lineNumber);

  return {
    currentLine: currentRegion?.startLine ?? null,
    parentLine: parentRegion?.startLine ?? null,
    nearestLine: currentRegion?.startLine ?? parentRegion?.startLine ?? null,
  };
}

export function findNearestRegionStartLine(regions: LargeJsonViewerRegion[], lineNumber: number) {
  return getRegionFoldTargets(regions, lineNumber).nearestLine;
}
