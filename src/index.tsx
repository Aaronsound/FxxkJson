import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const App = React.lazy(async () => {
  const { setupMonacoWorker } = await import('./setup/monaco');
  setupMonacoWorker();
  return import('./App');
});

const loadingShell = (
  <div className="app-loading-shell" role="status" aria-live="polite">
    <div className="app-loading-card">
      <div className="app-loading-eyebrow">FxxkJson</div>
      <div className="app-loading-title">正在加载 JSON 编辑器...</div>
      <div className="app-loading-subtitle">初始化高亮、搜索和大文件查看能力</div>
    </div>
  </div>
);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <Suspense fallback={loadingShell}>
    <App />
  </Suspense>
);
