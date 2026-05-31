import type { StructureStatus } from '../types/jsonTool';
import type { I18nKey } from './i18n';

type StatusTranslator = (key: I18nKey) => string;

interface RightPaneStatusArgs {
  canEnableLargeFileLocate: boolean;
  canUseRightPaneFolding: boolean;
  currentStructureStatus: StructureStatus;
  isLargeFileLocateEnabled: boolean;
  isLargeFileMode: boolean;
  t: StatusTranslator;
  usesDedicatedRightViewer: boolean;
  usesLightweightLocate: boolean;
}

export function getRightPaneStatusText({
  canEnableLargeFileLocate,
  canUseRightPaneFolding,
  currentStructureStatus,
  isLargeFileLocateEnabled,
  isLargeFileMode,
  t,
  usesDedicatedRightViewer,
  usesLightweightLocate,
}: RightPaneStatusArgs) {
  if (!isLargeFileMode) {
    return canUseRightPaneFolding ? t('pane.statusFolding') : null;
  }

  const foldingPrefix = usesDedicatedRightViewer ? `${t('pane.statusLightFolding')} · ` : '';

  if (!canEnableLargeFileLocate) {
    return `${foldingPrefix}${t('pane.statusLocateClosed')}`;
  }

  if (!isLargeFileLocateEnabled) {
    return `${foldingPrefix}${t('pane.statusLocateOff')}`;
  }

  if (currentStructureStatus === 'building') {
    return `${foldingPrefix}${t(
      usesLightweightLocate ? 'pane.statusLightLocateBuilding' : 'pane.statusLocateBuilding'
    )}`;
  }

  if (currentStructureStatus === 'ready') {
    return `${foldingPrefix}${t(usesLightweightLocate ? 'pane.statusLightLocateReady' : 'pane.statusLocateReady')}`;
  }

  return `${foldingPrefix}${t('pane.statusLocateClosed')}`;
}
