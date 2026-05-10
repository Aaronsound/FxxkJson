import type { ProcessingStage } from '../types/jsonTool';

export function getProcessingStageText(stage: ProcessingStage, fileName: string | null) {
  switch (stage) {
    case 'reading':
      return fileName ? `正在读取 ${fileName}` : '正在读取文件';
    case 'syncing-left':
      return '正在准备原始视图';
    case 'formatting':
      return '正在格式化 JSON';
    case 'repairing':
      return '正在修复 JSON';
    case 'building-viewer':
      return '正在构建右侧大文件视图';
    case 'building-index':
      return '正在建立定位索引';
    case 'idle':
    default:
      return null;
  }
}
