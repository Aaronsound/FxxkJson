import type { ChangeEvent, RefObject } from 'react';
import type { Tab } from '../types/jsonTool';
import { getFirstJsonImportFile } from '../utils/importFiles';

interface UseJsonImportActionsArgs {
  activeTab: Tab | undefined;
  fileInputRef: RefObject<HTMLInputElement | null>;
  importJsonFile: (tabId: string, file: File) => Promise<void>;
  importJsonText: (tabId: string, name: string, size: number, content: string) => Promise<void>;
  setTabError: (tabId: string, error: string | null) => void;
}

export function useJsonImportActions({
  activeTab,
  fileInputRef,
  importJsonFile,
  importJsonText,
  setTabError,
}: UseJsonImportActionsArgs) {
  const handleImport = async () => {
    if (!activeTab) {
      return;
    }

    if (window.electronAPI?.openJsonFile) {
      try {
        const file = await window.electronAPI.openJsonFile();
        if (file) {
          await importJsonText(activeTab.id, file.name, file.size, file.content);
        }
      } catch (error) {
        setTabError(activeTab.id, error instanceof Error ? `导入失败：${error.message}` : '导入失败');
      }
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    const file = getFirstJsonImportFile(selectedFiles);
    event.target.value = '';

    if (!activeTab || !selectedFiles || selectedFiles.length === 0) {
      return;
    }

    if (!file) {
      setTabError(activeTab.id, '请选择 .json 或 .txt 文件');
      return;
    }

    await importJsonFile(activeTab.id, file);
  };

  return {
    handleFileSelection,
    handleImport,
  };
}
