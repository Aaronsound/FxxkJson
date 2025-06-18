/**
 * 这个文件是给 TypeScript 补充类型声明的。
 * 
 * 目的：
 * Vite 支持 import worker 模块时使用 ?worker 语法，例如：
 * 
 *   import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
 * 
 * 但是 TypeScript 默认并不认识这种 ?worker 语法，会报错：
 * 
 *   Cannot find module 'xxx?worker'
 * 
 * 所以在这里我们手动告诉 TypeScript：
 * 当遇到这种路径时，这其实是一个 Worker 工厂类 (new Worker())。
 */

declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  // 告诉 TypeScript 这其实返回的是一个 Worker 构造函数
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

declare module 'monaco-editor/esm/vs/language/json/json.worker?worker' {
  // 同上，给 json worker 也做类似声明
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
