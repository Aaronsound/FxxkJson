## v1.0.37 本次更新

- 修复大文件编辑后保存关闭的卡顿，避免弹窗隐藏后对整份超长 JSON 重算布局，保留正常缩放和错误校验。
- 格式化、编辑保存和节点复制保留长整数、高精度小数、指数写法及重复字段，不再因重新序列化悄悄改变数值或丢掉字段。
- 重复 key 提供提示和原文定位；结构对比发现重复 key 时指出具体哪一侧有问题，避免误判内容一致。
- 对比结果支持按新增、删除、修改及字段路径筛选；明确区分已加载范围与完整结果，支持继续加载后续匹配。
- 新增“更多 → 另存为”，支持原文、格式化和单行压缩 JSON，原文模式可保存尚未修好的草稿。
- 新增“恢复关闭的标签”，支持 Ctrl/Cmd + Shift + T；本次运行中最多保留 10 个标签和 128 MiB 文本内存，不自动将报文写入磁盘。
- 更新中英文说明，并将无损保存、差异筛选、标签恢复和大文件错误编辑回归接入跨平台发布检查。

## What's New in v1.0.37

- Avoid costly hidden-editor layout when saving large JSON edits, while preserving responsive resizing and validation.
- Preserve large integers, precise decimals, exponent notation, and duplicate members when formatting, saving edits, or copying nodes, without silent numeric changes or field loss.
- Warn about duplicate keys and locate them in raw text. Structural comparison identifies duplicates on either side instead of reporting misleading equality.
- Filter differences by Added, Removed, Changed, or field path, with explicit partial-result status and continuation for later matches.
- Add More → Save as for raw, formatted, and single-line compact JSON; raw mode also saves invalid drafts.
- Add Reopen closed tab with Ctrl/Cmd + Shift + T. Retain at most 10 tabs and 128 MiB of text memory for this session only, without automatically writing documents to disk.
- Update bilingual documentation and add cross-platform release checks for lossless export, comparison filters, tab recovery, and large invalid-document editing.

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
