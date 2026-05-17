import type { StructureStatus } from '../types/jsonTool';

interface RightPaneStatusArgs {
  canEnableLargeFileLocate: boolean;
  canUseRightPaneFolding: boolean;
  currentStructureStatus: StructureStatus;
  isLargeFileLocateEnabled: boolean;
  isLargeFileMode: boolean;
  usesDedicatedRightViewer: boolean;
  usesLightweightLocate: boolean;
}

export function getRightPaneStatusText({
  canEnableLargeFileLocate,
  canUseRightPaneFolding,
  currentStructureStatus,
  isLargeFileLocateEnabled,
  isLargeFileMode,
  usesDedicatedRightViewer,
  usesLightweightLocate,
}: RightPaneStatusArgs) {
  if (!isLargeFileMode) {
    return canUseRightPaneFolding ? '支持折叠' : null;
  }

  const foldingPrefix = usesDedicatedRightViewer ? '轻量折叠 · ' : '';

  if (!canEnableLargeFileLocate) {
    return `${foldingPrefix}定位已关闭`;
  }

  if (!isLargeFileLocateEnabled) {
    return `${foldingPrefix}定位未启用`;
  }

  if (currentStructureStatus === 'building') {
    return `${foldingPrefix}${usesLightweightLocate ? '轻量定位准备中' : '定位索引中'}`;
  }

  if (currentStructureStatus === 'ready') {
    return `${foldingPrefix}${usesLightweightLocate ? '轻量定位已启用' : '定位已启用'}`;
  }

  return `${foldingPrefix}定位已关闭`;
}
