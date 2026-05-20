import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { Tab } from '../types/jsonTool';
import { getFirstJsonImportFile } from '../utils/importFiles';

interface UseJsonImportDropZoneArgs {
  activeTab: Tab | undefined;
  importJsonFile: (tabId: string, file: File) => Promise<void>;
  setTabError: (tabId: string, error: string | null) => void;
}

function hasDraggedFiles(event: DragEvent<HTMLDivElement>) {
  return Array.from(event.dataTransfer.types).includes('Files');
}

export function useJsonImportDropZone({
  activeTab,
  importJsonFile,
  setTabError,
}: UseJsonImportDropZoneArgs) {
  const dragImportDepthRef = useRef(0);
  const [isDragImportActive, setIsDragImportActive] = useState(false);

  const handleImportDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    dragImportDepthRef.current += 1;
    setIsDragImportActive(true);
  };

  const handleImportDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleImportDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragImportDepthRef.current = Math.max(0, dragImportDepthRef.current - 1);
    if (dragImportDepthRef.current === 0) {
      setIsDragImportActive(false);
    }
  };

  const handleImportDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragImportDepthRef.current = 0;
    setIsDragImportActive(false);

    if (!activeTab) {
      return;
    }

    const file = getFirstJsonImportFile(event.dataTransfer.files);
    if (!file) {
      setTabError(activeTab.id, '请拖入 .json 或 .txt 文件');
      return;
    }

    await importJsonFile(activeTab.id, file);
  };

  return {
    handleImportDragEnter,
    handleImportDragLeave,
    handleImportDragOver,
    handleImportDrop,
    isDragImportActive,
  };
}
