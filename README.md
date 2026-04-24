## README (English Version)

# HanJson (Vite Edition)

A desktop JSON formatting and comparison tool refactored with **Electron**, **React**, **Vite**, and **Monaco Editor**.

This project preserves the core features of HanJson while migrating the scaffold from Create React App to Vite for faster builds and startup, and continues iterative development.

### Features

* **Real-time JSON Formatting**: Paste or type any valid JSON in the left editor and see the formatted result in the right editor instantly.
* **Folding & Unfolding**: Collapse or expand all JSON nodes with one click for easier navigation of large files.
* **Search & Highlight**: Search within the formatted result and sync-highlight the raw JSON.
* **Dark & Light Themes**: Toggle between dark and light modes.
* **AST Parsing**: Build AST using `jsonc-parser` for syntax navigation and highlighting.
* **Desktop App**: Cross-platform support for Windows and macOS, with installer packaging via `electron-builder`.

### Repo Structure

```
.
├── electron/
│   ├── main.ts
│   └── preload.ts
├── public/
│   └── index.html
├── src/
│   ├── App.tsx
│   ├── index.tsx
│   ├── setup/monaco.ts
│   ├── monaco-workers/
│   └── workers/
├── tsconfig.json
├── tsconfig.electron.json
├── vite.config.ts
├── package.json
└── LICENSE
```

### Installation & Usage

```bash
git clone https://github.com/<your-username>/HanJson-vite.git
cd HanJson-vite
npm install
npm run dev   # start development mode
npm run build # build production bundle
npm start     # run production app
npm run dist  # create distributable
```

---

## README (中文版)

# HanJson (Vite 版)

基于 **Electron**、**React**、**Vite** 和 **Monaco Editor** 重构的桌面端 JSON 格式化与对比工具。

本项目在保留 HanJson 核心功能的基础上，将脚手架从 Create React App 切换至 Vite，提高构建与启动速度，并进一步迭代开发。

### 功能特性

* **实时 JSON 格式化**：粘贴或输入任意合法 JSON，右侧实时展示格式化结果。
* **折叠与展开**：一键折叠/展开所有节点，方便查看大文件。
* **搜索与高亮**：格式化结果中搜索关键词，同步高亮原始 JSON。
* **暗黑/亮色主题**：支持深浅色模式切换。
* **AST 解析**：基于 `jsonc-parser` 构建 AST，用于语法导航与高亮。
* **桌面应用**：跨平台支持 Windows 与 macOS，可通过 `electron-builder` 打包安装包。

### 目录结构

```
.
├── electron/
│   ├── main.ts
│   └── preload.ts
├── public/
│   └── index.html
├── src/
│   ├── App.tsx
│   ├── index.tsx
│   ├── setup/monaco.ts
│   ├── monaco-workers/
│   └── workers/
├── tsconfig.json
├── tsconfig.electron.json
├── vite.config.ts
├── package.json
└── LICENSE
```

### 安装与使用

```bash
git clone https://github.com/<你的用户名>/HanJson-vite.git
cd HanJson-vite
npm install
npm run dev   # 启动开发模式
npm run build # 构建生产包
npm start     # 运行生产版本
npm run dist  # 打包安装包
```

---
