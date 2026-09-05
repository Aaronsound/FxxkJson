## 本次更新

- JSON 语法错误现在显示行列信息，并支持“定位错误”，普通文件和大文件均可定位，原有自动修复行为不变。
- 通过现有“编辑 JSON”直接打开错误原文，跳到错误附近；保存失败不丢失草稿，仍在弹窗内定位并继续修改。修正原文后保存保留其他数字写法、空格和换行。
- JSON 对比在独立 Worker 中执行，每批 2,000 条，可继续加载全部差异；支持查看、分段阅读和复制完整差异值。
- 改善大整数、高精度小数及深层 JSON 对比的准确性；差异列表按视口绘制，长值按需读取，减少内存和重复计算。
- 减少连续搜索的大文本扫描与传输，修复右侧搜索切换时丢失已加载匹配项的问题。
- 关闭、清空标签或替换导入任务时中止过期读取，避免迟到结果覆盖新内容。
- 更新中英文使用指南，并在 macOS、Windows 发布前增加错误定位与 20MB 手动编辑回归测试。

## What's New

- Syntax errors now include line/column details and a Locate error action for both regular and large files, without changing automatic repair behavior.
- Open invalid raw text through the existing Edit JSON dialog near the error. Failed saves retain the draft and locate the error inside the dialog. Saving corrected raw text preserves unrelated number representations and whitespace.
- Run JSON comparisons in a dedicated worker and load all differences in resumable 2,000-entry batches; inspect, page through, and copy complete difference values.
- Improve comparison accuracy for large integers, precise decimals, and deeply nested JSON. Render nearby difference rows and read long values on demand to reduce memory use and repeated work.
- Reduce full-text scans and transfers during consecutive searches, and retain loaded right-editor matches when navigating results.
- Abort obsolete imports when tabs are closed, cleared, or replaced so late results cannot overwrite newer content.
- Update the bilingual user guides and add error-navigation and 20MB manual-edit regression tests before macOS and Windows packaging.

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
