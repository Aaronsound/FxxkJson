import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { setupMonacoWorker } from './setup/monaco'; // 引入你裸写的 worker 配置逻辑

// 初始化 Monaco 的 Worker 配置（这是你裸写 worker 的入口逻辑）
setupMonacoWorker();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
