## 本次更新

- 统一 JSON 编辑器字体、字号、行高和语法配色配置，避免小 JSON 与大 JSON 视图样式来回漂移。
- 恢复 Windows 上更清晰的 Consolas / 14px / 19px 编辑器基线，改善格式化结果的可读性。
- 将大文件只读视图、原始大文件视图和原生 JSON 视图统一改为消费同一组编辑器 CSS 变量。
- 增强 typography 测试，确保 Monaco 配置和 CSS 变量都从 `jsonEditorTypography` 获取。
- 修正发布说明中的下载说明标题，避免把 Windows 下载项放在 macOS 小节下。

## What's New

- Unified JSON editor font, size, line-height, and syntax color settings to prevent small-file and large-file views from drifting apart.
- Restored the clearer Windows editor baseline with Consolas / 14px / 19px for better formatted-result readability.
- Updated large readonly, large raw, and native JSON viewers to consume the same editor CSS variables.
- Strengthened typography tests so Monaco options and CSS variables both come from `jsonEditorTypography`.
- Fixed the release download notes heading so Windows downloads are no longer listed under a macOS-only section.

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
