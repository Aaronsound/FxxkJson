## 本次更新

- 全面整理桌面界面：响应式工具栏、固定的标签新增与滚动入口、可拖动双栏分隔线，以及统一的编辑、对比、诊断和关于弹窗。
- 新增翡翠绿、雾霾蓝、石墨灰、经典黑、蓝色、靛蓝和紫色 7 种强调色，选择会在本机保存，并适配浅色与深色模式。
- 改善键盘、焦点、搜索和右键菜单交互，在窄窗口以及 macOS / Windows 上保持更一致的布局和反馈。
- 优化大文件节点编辑与 worker 生命周期：使用增量文本更新、复用解析产物并减少全文扫描，降低多标签和 20MB JSON 场景的内存与耗时。
- 补齐英文界面的面板标题与大文件右键菜单，并用真实 Electron 应用重新生成、校验独立的中英文项目截图。

## What's New

- Refined the desktop UI with a responsive toolbar, fixed tab add/scroll controls, a draggable two-pane splitter, and consistent edit, compare, diagnostics, and about dialogs.
- Added seven persistent accent themes—Emerald, Mist Blue, Graphite, Obsidian, Blue, Indigo, and Violet—with coordinated light and dark variants.
- Improved keyboard, focus, search, and context-menu behavior for more consistent feedback in narrow windows and across macOS and Windows.
- Reduced large-file node-edit and worker overhead through incremental text updates, reusable parser artifacts, fewer full scans, and stronger multi-tab/20MB regression coverage.
- Completed English pane and large-file context-menu localization, then regenerated and verified separate Chinese and English screenshots against the real Electron app.

## 下载说明

- Apple M 系列芯片（M1 / M2 / M3 / M4）：下载 `macos-arm64-*.dmg`
- Intel 芯片 Mac：下载 `macos-x64-*.dmg`
- Windows：下载 `windows-x64-*.exe`

如果 M 系列 Mac 误装 x64 包，应用会通过 Rosetta 转译运行，导入和格式化大 JSON 可能明显变慢。

## Download Notes

- Apple Silicon Macs (M1 / M2 / M3 / M4): download `macos-arm64-*.dmg`.
- Intel Macs: download `macos-x64-*.dmg`.
- Windows: download `windows-x64-*.exe`.

If an Apple Silicon Mac installs the x64 package, the app will run through Rosetta and large JSON import or formatting may be noticeably slower.
