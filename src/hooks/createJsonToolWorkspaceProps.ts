import type React from 'react';
import type { OnMount } from '@monaco-editor/react';
import type JsonToolWorkspace from '../components/JsonToolWorkspace';
import type JsonEditorPanes from '../components/JsonEditorPanes';
import type JsonToolContextMenus from '../components/JsonToolContextMenus';
import type JsonToolOverlayLayer from '../components/JsonToolOverlayLayer';
import type JsonToolTabBar from '../components/JsonToolTabBar';
import type JsonToolToolbar from '../components/JsonToolToolbar';
import type JsonPerformancePanel from '../components/JsonPerformancePanel';
import type { LargeJsonReadonlyViewerHandle } from '../components/LargeJsonReadonlyViewer';
import type { Tab } from '../types/jsonTool';
import { createJsonToolContextMenusProps, createJsonToolPanesProps } from './jsonToolPaneMenuProps';
import { createJsonToolOverlayProps, createJsonToolToolbarProps } from './jsonToolOverlayToolbarProps';

type JsonToolWorkspaceProps = React.ComponentProps<typeof JsonToolWorkspace>;
type JsonEditorPanesProps = React.ComponentProps<typeof JsonEditorPanes>;
type JsonToolContextMenusProps = React.ComponentProps<typeof JsonToolContextMenus>;
type JsonToolOverlayLayerProps = React.ComponentProps<typeof JsonToolOverlayLayer>;
type JsonToolTabBarProps = React.ComponentProps<typeof JsonToolTabBar>;
type JsonToolToolbarProps = React.ComponentProps<typeof JsonToolToolbar>;
type JsonPerformancePanelProps = React.ComponentProps<typeof JsonPerformancePanel>;

type RightEditorRef = React.MutableRefObject<{
  getAction: (id: string) => { run: () => void } | null;
} | null>;

type JsonToolWorkspaceShellInput = {
  activePerformanceSnapshot: JsonPerformancePanelProps['snapshot'];
  activeTabId: JsonToolTabBarProps['activeTabId'];
  addTab: JsonToolTabBarProps['onAddTab'];
  cancelRenaming: JsonToolTabBarProps['onCancelRenaming'];
  closeTab: JsonToolTabBarProps['onCloseTab'];
  finishRenaming: JsonToolTabBarProps['onFinishRenaming'];
  handleRenamingChange: JsonToolTabBarProps['onRenamingChange'];
  isDarkMode: JsonPerformancePanelProps['isDarkMode'];
  performanceHistory: JsonPerformancePanelProps['history'];
  renamingTab: JsonToolTabBarProps['renamingTab'];
  setActiveTabId: JsonToolTabBarProps['onSelectTab'];
  startRenamingTab: JsonToolTabBarProps['onStartRenaming'];
  tabs: JsonToolTabBarProps['tabs'];
};

type JsonToolOverlayInput = {
  activeTab: Tab;
  cancelMutationDialog: JsonToolOverlayLayerProps['onCancelMutationDialog'];
  closeEditJson: JsonToolOverlayLayerProps['onCloseEditJson'];
  confirmDeleteDialog: JsonToolOverlayLayerProps['onConfirmDeleteMutationDialog'];
  confirmRenameDialog: JsonToolOverlayLayerProps['onConfirmRenameMutationDialog'];
  diagnosticsContext: JsonToolOverlayLayerProps['diagnosticsContext'];
  editJsonBusyLabel: JsonToolOverlayLayerProps['editJsonBusyLabel'];
  editJsonError: JsonToolOverlayLayerProps['editJsonError'];
  editJsonSession: JsonToolOverlayLayerProps['editJsonSession'];
  editJsonValueRef: React.MutableRefObject<string>;
  getTabContent: JsonToolOverlayLayerProps['getTabText'];
  handleCopyEscapedJson: JsonToolOverlayLayerProps['onCopyEscapedJson'];
  handleEscapeEditJsonContent: JsonToolOverlayLayerProps['onEscapeEditJsonContent'];
  handleOpenAbout: JsonToolOverlayLayerProps['onOpenAbout'];
  handleSaveEditJson: JsonToolOverlayLayerProps['onSaveEditJson'];
  handleUnescapeEditJsonContent: JsonToolOverlayLayerProps['onUnescapeEditJsonContent'];
  hasCopiedLiteral: JsonToolOverlayLayerProps['hasCopiedLiteral'];
  isAboutOpen: JsonToolOverlayLayerProps['isAboutOpen'];
  isArchitectureWarningDismissed: JsonToolOverlayLayerProps['isArchitectureWarningDismissed'];
  isCompareOpen: JsonToolOverlayLayerProps['isCompareOpen'];
  isDiagnosticsLogOpen: JsonToolOverlayLayerProps['isDiagnosticsLogOpen'];
  isDragImportActive: JsonToolOverlayLayerProps['isDragImportActive'];
  rightNodeMutationDialog: JsonToolOverlayLayerProps['rightNodeMutationDialog'];
  runtimeInfo: JsonToolOverlayLayerProps['runtimeInfo'];
  setIsAboutOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsArchitectureWarningDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCompareOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDiagnosticsLogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  t: JsonToolOverlayLayerProps['t'];
};

type JsonToolToolbarInput = {
  canCompareJson: JsonToolToolbarProps['canCompareJson'];
  canControlRightPaneFolding: JsonToolToolbarProps['canControlRightPaneFolding'];
  canEditJson: JsonToolToolbarProps['canEditJson'];
  canEnableLargeFileLocate: JsonToolToolbarProps['canEnableLargeFileLocate'];
  currentError: JsonToolToolbarProps['currentError'];
  currentStructureStatus: JsonToolToolbarProps['currentStructureStatus'];
  handleClear: JsonToolToolbarProps['onClear'];
  handleEscapeJson: JsonToolToolbarProps['onEscapeJson'];
  handleFormat: JsonToolToolbarProps['onFormat'];
  handleImport: JsonToolToolbarProps['onImport'];
  handleLargeFileLocateToggle: JsonToolToolbarProps['onLargeFileLocateToggle'];
  handleOpenCompare: JsonToolToolbarProps['onOpenCompare'];
  handleOpenDiagnosticsLog: JsonToolToolbarProps['onOpenDiagnosticsLog'];
  handleOpenEditJson: JsonToolToolbarProps['onEditJson'];
  handleRepairJson: JsonToolToolbarProps['onRepairJson'];
  handleToggleDarkMode: JsonToolToolbarProps['onToggleDarkMode'];
  handleUnescapeJson: JsonToolToolbarProps['onUnescapeJson'];
  importingFileName: JsonToolToolbarProps['importingFileName'];
  isLargeFileLocateEnabled: JsonToolToolbarProps['isLargeFileLocateEnabled'];
  isLargeFileMode: JsonToolToolbarProps['isLargeFileMode'];
  language: JsonToolToolbarProps['language'];
  largeViewerRef: React.MutableRefObject<LargeJsonReadonlyViewerHandle | null>;
  processingStageText: JsonToolToolbarProps['processingStageText'];
  rightEditorRef: RightEditorRef;
  setLanguage: JsonToolToolbarProps['onLanguageChange'];
  setShowPerformancePanel: JsonToolToolbarProps['onShowPerformancePanelChange'];
  setWrapLongLines: JsonToolToolbarProps['onWrapLongLinesChange'];
  shouldUseDedicatedRightViewer: boolean;
  showPerformancePanel: JsonToolToolbarProps['showPerformancePanel'];
  usesLightweightLocate: JsonToolToolbarProps['usesLightweightLocate'];
  wrapLongLines: JsonToolToolbarProps['wrapLongLines'];
};

type JsonToolPanesInput = {
  activeDocumentMeta: { rawLength: number };
  activeLargeRawViewerData: JsonEditorPanesProps['activeLargeRawViewerData'];
  activeLargeViewerCollapsedLines: JsonEditorPanesProps['activeLargeViewerCollapsedLines'];
  activeLargeViewerData: JsonEditorPanesProps['activeLargeViewerData'];
  activeLeftMatchCount: JsonEditorPanesProps['activeLeftMatchCount'];
  activeRawText: JsonEditorPanesProps['activeRawText'];
  activeRightMatchCount: JsonEditorPanesProps['activeRightMatchCount'];
  activeRightPinnedPathItems: JsonEditorPanesProps['rightPinnedPaths'];
  activeRightSelectedRange: JsonEditorPanesProps['rightSelectedRange'];
  applyRightNodeMutationAtOffset: (
    tabId: string,
    offset: number,
    rightOnly: boolean,
    operation: 'delete-node' | 'rename-node-key'
  ) => void | Promise<void>;
  copyNodeDetailAtOffset: (
    tabId: string,
    offset: number,
    rightOnly: boolean,
    detail: 'compact-json' | 'formatted-json' | 'key' | 'path'
  ) => void | Promise<void>;
  copyValueAtOffset: (tabId: string, offset: number, rightOnly: boolean) => void | Promise<void>;
  closeLeftFind: JsonEditorPanesProps['onCloseLeftFind'];
  closeRightFind: JsonEditorPanesProps['onCloseRightFind'];
  formattedValue: JsonEditorPanesProps['formattedValue'];
  gotoNextLeft: JsonEditorPanesProps['onNextLeft'];
  gotoNextRight: JsonEditorPanesProps['onNextRight'];
  gotoPrevLeft: JsonEditorPanesProps['onPrevLeft'];
  gotoPrevRight: JsonEditorPanesProps['onPrevRight'];
  handleLeftChange: JsonEditorPanesProps['onLeftChange'];
  handleLeftMount: OnMount;
  handleLeftSearchOptionsChange: JsonEditorPanesProps['onLeftSearchOptionsChange'];
  handleLeftSearchTermChange: JsonEditorPanesProps['onLeftSearchTermChange'];
  handleOpenEditNodeAtOffset: (tabId: string, offset: number, rightOnly: boolean) => void | Promise<void>;
  handleOpenUnescapedNodeAtOffset: (tabId: string, offset: number, rightOnly: boolean) => void | Promise<void>;
  handleRightMount: OnMount;
  handleRightSearchOptionsChange: JsonEditorPanesProps['onRightSearchOptionsChange'];
  handleRightSearchTermChange: JsonEditorPanesProps['onRightSearchTermChange'];
  isBuildingDedicatedRightViewer: JsonEditorPanesProps['isBuildingDedicatedRightViewer'];
  isFormattingActiveTab: JsonEditorPanesProps['isFormattingActiveTab'];
  isImportingActiveTab: JsonEditorPanesProps['isImportingActiveTab'];
  isLeftFindOpen: JsonEditorPanesProps['isLeftFindOpen'];
  isLeftSearchLoadingMore: JsonEditorPanesProps['isLeftSearchLoadingMore'];
  isRightFindOpen: JsonEditorPanesProps['isRightFindOpen'];
  isRightSearchLoadingMore: JsonEditorPanesProps['isRightSearchLoadingMore'];
  largeRawViewerRef: JsonEditorPanesProps['largeRawViewerRef'];
  largeViewerMatches: JsonEditorPanesProps['largeViewerMatches'];
  leftPaneMetaText: JsonEditorPanesProps['leftPaneMetaText'];
  leftRawHighlightRange: JsonEditorPanesProps['leftRawHighlightRange'];
  leftReplaceText: JsonEditorPanesProps['leftReplaceText'];
  leftSearchHasMore: JsonEditorPanesProps['leftSearchHasMore'];
  leftSearchOptions: JsonEditorPanesProps['leftSearchOptions'];
  leftSearchTerm: JsonEditorPanesProps['leftSearchTerm'];
  loadMoreLeftSearch: JsonEditorPanesProps['onLoadMoreLeftSearch'];
  loadMoreRightSearch: JsonEditorPanesProps['onLoadMoreRightSearch'];
  normalizedLeftMatchIndex: JsonEditorPanesProps['normalizedLeftMatchIndex'];
  normalizedRightMatchIndex: JsonEditorPanesProps['normalizedRightMatchIndex'];
  openRightFind: JsonEditorPanesProps['onOpenRightFind'];
  pinActiveRightPath: JsonEditorPanesProps['onPinCurrentRightPath'];
  rememberRightSearchTerm: (value: string) => void;
  replaceAllLeftMatches: JsonEditorPanesProps['onLeftReplaceAll'];
  replaceLeftMatch: JsonEditorPanesProps['onLeftReplace'];
  requestWorkerLocate: (tabId: string, offset: number) => void;
  rightMatchIndex: JsonEditorPanesProps['rightMatchIndex'];
  rightPaneMetaText: JsonEditorPanesProps['rightPaneMetaText'];
  rightRecentSearches: JsonEditorPanesProps['rightRecentSearches'];
  rightSearchHasMore: JsonEditorPanesProps['rightSearchHasMore'];
  rightSearchOptions: JsonEditorPanesProps['rightSearchOptions'];
  rightSearchTerm: JsonEditorPanesProps['rightSearchTerm'];
  selectRightPinnedPath: JsonEditorPanesProps['onSelectRightPinnedPath'];
  setIsRightFindOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLargeViewerCollapsedLinesByTab: React.Dispatch<React.SetStateAction<Record<string, number[]>>>;
  setLargeViewerMatchCount: JsonEditorPanesProps['onRightMatchCountChange'];
  setLeftReplaceText: JsonEditorPanesProps['onLeftReplaceValueChange'];
  setRightMatchIndex: React.Dispatch<React.SetStateAction<number>>;
  setRightSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  shouldEnableRightPaneFolding: JsonEditorPanesProps['shouldEnableRightPaneFolding'];
  shouldUseDedicatedLeftViewer: JsonEditorPanesProps['shouldUseDedicatedLeftViewer'];
};

type JsonToolContextMenusInput = Pick<
  JsonToolContextMenusProps,
  | 'applyRightNodeMutationAtOffset'
  | 'copyLeftEditorSelection'
  | 'copyNodeDetailAtOffset'
  | 'copyValueAtOffset'
  | 'cutLeftEditorSelection'
  | 'handleOpenEditNodeAtOffset'
  | 'handleOpenUnescapedNodeAtOffset'
  | 'leftEditorContextMenu'
  | 'pasteIntoLeftEditor'
  | 'rightEditorContextMenu'
  | 'selectAllLeftEditorText'
  | 'setLeftEditorContextMenu'
  | 'setRightEditorContextMenu'
  | 'shouldUseDedicatedLeftViewer'
  | 'shouldUseDedicatedRightViewer'
  | 'toggleRightFoldAtOffset'
>;

export type JsonToolWorkspaceInput = JsonToolWorkspaceShellInput &
  JsonToolOverlayInput &
  JsonToolToolbarInput &
  JsonToolPanesInput &
  JsonToolContextMenusInput;

export function createJsonToolWorkspaceProps(
  input: JsonToolWorkspaceInput
): Pick<
  JsonToolWorkspaceProps,
  'contextMenusProps' | 'overlayProps' | 'panesProps' | 'performancePanelProps' | 'tabBarProps' | 'toolbarProps'
> {
  return {
    contextMenusProps: createJsonToolContextMenusProps(input),
    overlayProps: createJsonToolOverlayProps(input),
    panesProps: createJsonToolPanesProps(input),
    performancePanelProps: {
      snapshot: input.activePerformanceSnapshot,
      history: input.performanceHistory,
      isDarkMode: input.isDarkMode,
    },
    tabBarProps: {
      tabs: input.tabs,
      activeTabId: input.activeTabId,
      renamingTab: input.renamingTab,
      onSelectTab: input.setActiveTabId,
      onStartRenaming: input.startRenamingTab,
      onRenamingChange: input.handleRenamingChange,
      onFinishRenaming: input.finishRenaming,
      onCancelRenaming: input.cancelRenaming,
      onCloseTab: input.closeTab,
      onAddTab: input.addTab,
    },
    toolbarProps: createJsonToolToolbarProps(input),
  };
}
