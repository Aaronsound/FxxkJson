import type { StructureStatus } from '../types/jsonTool';

interface RightPaneStatusArgs {
  canEnableLargeFileLocate: boolean;
  canUseRightPaneFolding: boolean;
  currentStructureStatus: StructureStatus;
  isLargeFileLocateEnabled: boolean;
  isLargeFileMode: boolean;
  usesLightweightLocate: boolean;
}

export function getRightPaneStatusText({
  canEnableLargeFileLocate,
  canUseRightPaneFolding,
  currentStructureStatus,
  isLargeFileLocateEnabled,
  isLargeFileMode,
  usesLightweightLocate,
}: RightPaneStatusArgs) {
  if (!isLargeFileMode) {
    return canUseRightPaneFolding ? '支持折叠' : null;
  }

  if (!canEnableLargeFileLocate) {
    return '定位已关闭';
  }

  if (!isLargeFileLocateEnabled) {
    return '定位未启用';
  }

  if (currentStructureStatus === 'building') {
    return usesLightweightLocate ? '轻量定位准备中' : '定位索引中';
  }

  if (currentStructureStatus === 'ready') {
    return usesLightweightLocate ? '轻量定位已启用' : '定位已启用';
  }

  return '定位已关闭';
}
