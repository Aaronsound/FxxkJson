# 更新日志 / Changelog

## 未发布 / Unreleased

### 中文

- 重构中英文 README 首屏，突出大文件、本地处理、跨平台下载和 30 秒上手流程。
- 新增由真实 Electron 截图合成的中英文动态演示，以及用于 GitHub 分享卡片的 Social Preview 封面。
- 增加可重复执行的动态演示生成脚本，并将其接入文档截图流程。

### English

- Reworked the Chinese and English README landing sections around large files, local processing, cross-platform downloads, and a 30-second quick start.
- Added bilingual animated demos assembled from real Electron screenshots and a Social Preview image for GitHub link cards.
- Added a reproducible animated-demo generator and connected it to the documentation screenshot workflow.

## v1.0.33 - 2026-08-28

### 中文

- 在中英文 README 中补充项目从 HanJson、HanJson-vite 到 FxxkJson 的演进说明。
- 修复 Windows 工作区路径包含空格时的构建产物体积报告。
- 增加仓库换行符默认配置，保持 Windows、本地开发环境和 CI 格式一致。
- 为 Electron 打包链间接依赖的 `tmp` 安全公告增加 npm override。
- 将桌面版发布说明移至共享 Markdown 文件，避免发布工作流重复维护相同内容。
- 通过增量文本补丁、可复用 worker 产物、更严格的缓存生命周期和更少的全文扫描，降低大文件编辑开销。
- 扩充 5MB/20MB 性能回归、多标签内存、打包应用冒烟测试和跨平台发布校验。
- 优化响应式桌面工作区，加入可拖动分隔线、紧凑的溢出导航、固定标签控制、统一弹窗、上下文搜索、焦点反馈和无障碍右键菜单。
- 新增 7 种可持久化强调色及配套的浅色/深色变体，并统一组件间距、颜色、复选框对齐和交互状态。
- 补齐面板标题和大文件右键菜单的英文翻译传递。
- 新增可重复执行的 Electron 自动化，为中英文文档分别生成截图，并更新全部 README 图片。

### English

- Documented the project evolution from HanJson to HanJson-vite and FxxkJson in the Chinese and English README files.
- Fixed bundle size reporting on Windows workspaces whose paths contain spaces.
- Added repository line-ending defaults for consistent local formatting on Windows and CI.
- Added an npm override for the transitive `tmp` dependency advisory pulled in by Electron packaging.
- Moved desktop release notes into a shared Markdown file so the release workflow does not duplicate the same body text.
- Reduced large-file edit overhead with incremental text patches, reusable worker artifacts, tighter cache lifecycle management, and fewer full-document scans.
- Expanded 5MB/20MB performance coverage, multi-tab memory checks, packaged-app smoke tests, and cross-platform release validation.
- Refined the responsive desktop workspace with a draggable splitter, compact overflow navigation, fixed tab controls, consistent dialogs, contextual search, focus feedback, and accessible context menus.
- Added seven persistent accent themes with coordinated light/dark variants and normalized component spacing, colors, checkbox alignment, and interaction states.
- Completed English propagation for pane headers and large-file context menus.
- Added deterministic Electron automation for separate Chinese and English documentation screenshots and refreshed every README image.

## v1.0.25

### 中文

- 将对外项目名称和应用元数据重命名为 FxxkJson。
- 新增中英文界面切换。
- 恢复小 JSON 与大 JSON 查看器右侧排版的一致性。
- 补充开源项目所需的 MIT 许可证、贡献指南、Issue 模板、Pull Request 模板和安全策略。
- 改进发布工作流检查和发布资产校验。

### English

- Renamed the public project and app metadata to FxxkJson.
- Added Chinese / English UI switching.
- Restored consistent right-pane typography between small JSON and large JSON viewers.
- Added open-source readiness files: MIT license, contributing guide, issue templates, pull request template, and security policy.
- Improved release workflow checks and release asset validation.

## v1.0.24

### 中文

- 完成项目公开发布前的准备工作。
- 更新包元数据、应用 ID 和桌面产品名称。
- 补充发布及验证流程的仓库文档。

### English

- Prepared the project for public release.
- Updated package metadata, app id, and desktop product name.
- Added repository documentation for release and validation workflows.

## v1.0.23

### 中文

- 通过共享防回归测试保持小 JSON 和大 JSON 右侧排版一致。
- 拆分右侧编辑器右键菜单职责。
- 集中管理 worker 交互请求的清理逻辑。
- 优化大 JSON 查看器的行标题处理。
- 扩充 Electron E2E 和性能 CI 覆盖。

### English

- Kept small and large JSON right-pane typography in sync with a shared guard test.
- Extracted right editor context menu responsibilities.
- Centralized worker interactive request cleanup.
- Added large JSON viewer line-title optimization.
- Expanded Electron E2E and performance CI coverage.

## v1.0.22

### 中文

- 通过校准 JSON Path 行为提升大 JSON 定位准确性。
- 新增 JSON 对比弹窗，支持展示新增、删除和变更字段。
- 增强右侧节点操作：复制路径、key、值、紧凑或格式化 JSON，以及编辑、删除和重命名。
- 改进右侧搜索，支持最近搜索记录和固定路径。
- 从大型模块中拆分搜索快捷入口、右侧节点操作和 worker 节点编辑逻辑。
- 增加 Electron JSON 流程 E2E 覆盖。

### English

- Improved large JSON locate accuracy by calibrating JSON Path behavior.
- Added JSON compare dialog for added, removed, and changed fields.
- Enhanced right-side node actions: copy path/key/value, copy compact/formatted JSON, edit, delete, and rename.
- Improved right search with recent searches and pinned paths.
- Split search quick access, right node actions, and worker node edit operations out of larger modules.
- Added Electron JSON flow E2E coverage.
