## 本次更新

- 提升 20MB 以上 JSON 的导入、格式化、连续转义与反转义速度，并严格保留原始空格、缩进和换行。
- 精简大文件关键路径中的全文扫描、字符串复制和 Worker 传输，让格式化结果更快显示，同时保持搜索、定位、折叠和编辑语义不变。
- 加强 Worker 异常恢复、超时清理和多标签缓存回收，避免关闭标签或通信异常后继续占用大文本和过期任务。
- 稳定搜索、性能记录、编辑器同步和标签操作回调，减少无关重绘与重复副作用，并修复双栏搜索关闭等交互边界。
- 将编辑、对比、诊断、关于和节点操作弹窗改为按需加载，使主程序包由约 277KB 降至 221KB，并加入持续体积门槛。
- 强化新建标签入口、标签级状态提示和窄窗口交互，同时扩充跨平台 Electron E2E、性能、内存与编排测试。
- 更新中英文 README、使用指南、真实应用演示和 GitHub 分享图片，并加强 macOS 与 Windows 发布前校验。

## What's New

- Accelerated import, formatting, repeated escape, and unescape operations for JSON files of 20MB and beyond while preserving original whitespace exactly.
- Removed redundant full-document scans, string copies, and worker transfers from large-file critical paths so results appear sooner without changing search, locate, folding, or edit semantics.
- Hardened worker recovery, timeout cleanup, and multi-tab cache eviction to release large text and obsolete work promptly after failures or tab closure.
- Stabilized search, performance tracking, editor synchronization, and tab callbacks to reduce unrelated renders and repeated effects, including dual-pane search edge cases.
- Lazy-loaded edit, compare, diagnostics, about, and node-action dialogs, reducing the main App bundle from about 277KB to 221KB with a dedicated size budget.
- Refined new-tab access, tab-scoped status guidance, and narrow-window interactions while expanding cross-platform Electron E2E, performance, memory, and orchestration coverage.
- Refreshed the bilingual README, user guides, real-app demos, and GitHub social image, with stronger macOS and Windows release validation.

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
