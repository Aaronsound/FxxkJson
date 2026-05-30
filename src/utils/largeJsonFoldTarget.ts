import type { LargeJsonViewerRegion } from '../types/jsonTool';

export function findNearestRegionStartLine(regions: LargeJsonViewerRegion[], lineNumber: number) {
  let nearestRegion: LargeJsonViewerRegion | null = null;

  for (const region of regions) {
    if (lineNumber < region.startLine || lineNumber > region.endLine) {
      continue;
    }

    if (!nearestRegion || region.startLine >= nearestRegion.startLine) {
      nearestRegion = region;
    }
  }

  return nearestRegion?.startLine ?? null;
}
