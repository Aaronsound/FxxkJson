/**
 * 这个文件用于初始化 Monaco Editor 的 Worker 逻辑。
 * 
 * 核心背景：
 * - Monaco Editor 在执行语法分析、折叠、补全、错误提示等操作时，内部是通过 Web Worker 实现的。
 * - 默认情况下，Monaco 在运行时动态去加载这些 Worker 文件。
 * - 但是在 Electron + Vite 打包环境中，如果不做配置，Monaco 无法自动正确找到 Worker 文件路径。
 * 
 * 本文件的作用：
 * - 主动 import 相关语言的 Worker 模块，利用 Vite 原生的 `?worker` 语法，让 Vite 自动把 Worker 分包成独立文件；
 * - 通过设置 `MonacoEnvironment.getWorker()`，告诉 Monaco Editor 如何返回对应的 Worker 实例；
 * - 这样，Monaco Editor 就可以在任何环境下（包括打包后的 Electron 桌面应用）正确加载到对应 Worker。
 */

// 导入 Monaco 的通用 Editor Worker（用于默认编辑器逻辑）
import loader from '@monaco-editor/loader';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// 导入 Monaco 的 JSON 语言 Worker（用于 JSON 文件的语法分析、格式校验）
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';

/**
 * 初始化 Monaco Editor 的 Worker 配置。
 * 需要在应用启动时最早阶段调用一次。
 */
export function setupMonacoWorker() {
  loader.config({ monaco });
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    enableSchemaRequest: false,
    schemas: [],
  });

  self.MonacoEnvironment = {
    getWorker: function (moduleId, label) {
      // 根据 label 类型，返回不同的 Worker 实例
      if (label === 'json') {
        return new JsonWorker();
      }
      // 默认返回通用编辑器 Worker
      return new EditorWorker();
    }
  };
}
