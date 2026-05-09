# HanJson

Desktop JSON formatting and inspection tool built with Electron, React, Vite, and Monaco Editor.

HanJson is focused on day-to-day JSON work: paste or import JSON on the left, inspect the formatted result on the right, search within either pane, and keep large files usable through a dedicated virtualized viewer.

## Features

- Real-time JSON formatting for pasted, typed, or imported content.
- Multi-tab workspace with per-tab document state.
- Left-pane search and replace, plus right-pane search for formatted output.
- Dedicated large-file viewer for 5MB+ JSON with virtualized rows, fold/unfold, copy value, and optional right-to-left locate.
- Worker-based formatting, search, value copy, and large-file indexing to keep the UI responsive.
- Performance panel with recent formatting/import timing snapshots.
- Light/dark mode, long-line wrapping, and Electron desktop packaging for macOS and Windows.

## Project Structure

```text
.
├── electron/
│   ├── main.ts
│   └── preload.ts
├── src/
│   ├── components/
│   ├── hooks/
│   ├── setup/
│   ├── test/
│   ├── types/
│   ├── utils/
│   ├── workers/
│   ├── App.tsx
│   └── index.tsx
├── docs/
├── scripts/
├── vite.config.mts
├── vitest.config.mts
├── tsconfig.json
├── tsconfig.electron.json
└── package.json
```

## Commands

```bash
npm install
npm run dev        # run the Electron + Vite dev app
npm run typecheck  # type-check renderer and Electron sources
npm test           # run Vitest tests
npm run build      # build renderer and Electron output
npm run check      # typecheck + test + build
npm run samples    # generate ignored json/sample-*.json files
npm run bench -- --samples
npm start          # run the built desktop app after npm run build
```

Packaging commands are available as `npm run dist:mac`, `npm run dist:win`, and `npm run dist`. Generated installers are written to `release/`.

## Large JSON Notes

- Files at or above `5MB` enter large-file mode.
- Formatted output at or above `5MB` uses the dedicated readonly viewer instead of a second Monaco model.
- Optional right-to-left locate is available for large files, but expensive structure trees are deferred until locate/copy behavior is actually used.
- Generated samples live in `json/`; that directory is intentionally ignored by git.

---

# HanJson 中文说明

HanJson 是一个桌面端 JSON 格式化、搜索和大文件查看工具，基于 Electron、React、Vite 和 Monaco Editor 构建。

## 主要能力

- 左侧粘贴、输入或导入 JSON，右侧实时展示格式化结果。
- 多标签页工作区，每个标签保留独立内容和状态。
- 左侧支持搜索和替换，右侧支持格式化结果搜索。
- 5MB 及以上 JSON 自动进入大文件模式，使用虚拟滚动 viewer，支持折叠、展开、复制值和可选右侧定位左侧。
- 格式化、搜索、复制值和大文件索引运行在 Worker 中，尽量避免阻塞界面。
- 性能面板展示导入、格式化、viewer 索引等耗时。
- 支持深浅色模式、长行换行，以及 macOS/Windows 桌面端打包。

## 常用命令

```bash
npm install
npm run dev        # 启动 Electron + Vite 开发版桌面应用
npm run typecheck  # 检查渲染端和 Electron 端类型
npm test           # 运行自动化测试
npm run build      # 构建生产产物
npm run check      # typecheck + test + build
npm run samples    # 生成本地大 JSON 样例
npm run bench -- --samples
npm start          # 构建后启动桌面端生产版本
```

打包命令：`npm run dist:mac`、`npm run dist:win`、`npm run dist`。产物输出到 `release/`。
