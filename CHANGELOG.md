# 更新日志 / Changelog

## 未发布 / Unreleased

## v1.0.34 - 2026-09-05

### 中文

- 重构中英文 README 首屏，突出大文件、本地处理、跨平台下载和 30 秒上手流程。
- 新增由真实 Electron 截图合成的中英文动态演示，以及用于 GitHub 分享卡片的 Social Preview 封面。
- 增加可重复执行的动态演示生成脚本，并将其接入文档截图流程。
- 将完整 Electron E2E 扩展到 Linux、macOS 和 Windows，并在发布前为每个目标执行 20MB 场景。
- 将全部 renderer 源码纳入覆盖率基线，补齐内容操作和 worker 编辑流程的关键分支测试。
- 固定生产依赖安全审计使用 npm 官方接口，并加入面向 `dev` 的 Dependabot 小版本自动维护。
- 降低 Electron 原生大文件导入的临时字符串占用，并兼容读取期间文件大小变化。
- 修复少行超长 JSON 未进入虚拟查看器及过期结构任务仍可能回传结果的问题。
- 补齐格式化 Worker、标签状态和左右搜索编排的防回归测试与覆盖率门槛。
- 在保留原有绿色辨识度的基础上适度淡化默认主题，并同步浅色和深色交互状态。
- 统一工具栏复选框的选中与未选中尺寸和基线，避免 macOS、Windows 原生控件绘制差异造成错位。
- 适度强化固定在标签栏右侧的新建加号，并保留中英文悬浮提示。
- 让 JSON 转义与反转义严格保留原始空格、缩进和换行，避免往返操作意外格式化左侧内容。
- 统一大文件左侧查看器与普通编辑器的 JSON 语法颜色和逻辑行号，并通过可转移缓冲区保证 20MB 内容转义往返仍原样恢复。
- 优化 20MB 内容的连续转义：跳过无用的重复解析，并延后可被后续操作替代的右侧大文件构建。
- 让连续大文件转换复用 Worker 文本和语义等价的格式化结果；更深层转义会同步右侧并使用分块虚拟渲染，同时让原生文件流在开始读取前先绘制进度提示。
- 移除格式化关键路径中的重复全文度量与语法扫描，复用单次编码结果，并将“结果可发送”耗时纳入 5MB/20MB 性能回归门槛。
- 让 Electron 原生导入直接把已读取的文件缓冲区转交格式化 Worker，避免 20MB 文本在渲染进程重复 UTF-8 编码。
- 关闭或清空标签时立即释放等待中的大文件结果和格式化超时定时器，避免中途退出留下大文本引用。
- 将 Worker 大文件查看缓存限制为最近两个标签，并在切回被淘汰标签时透明恢复搜索和定位能力。
- Worker 加载或通信异常时自动重建，并安全重试尚未完成的格式化请求。
- 将标签级处理状态和大文件提示移到标签栏下方，避免不同类型标签切换时标签栏上下跳动。
- 关闭大文件定位时仅释放定位索引，保留右侧查看和搜索缓存，重新启用时仍保持原有定位语义。
- Worker 重启后安全恢复未完成的搜索、定位和编辑请求，同时继续忽略旧 Worker 的迟到结果。
- 增加 Electron 冷启动预算和两轮大文件多标签内存回归，持续检测启动退化与累积内存泄漏。
- 让新建标签按钮在标签较少时紧跟最后一个标签、溢出时保持可见，并补充快捷键与标签栏空白处双击新建。
- 稳定搜索、性能记录、编辑器同步与 Worker 生命周期回调，消除 Hook 依赖告警并避免重复副作用。
- 补充拖拽导入、性能会话和编辑器模型同步的编排测试，覆盖异常文件与回调更新场景。
- 将搜索和编辑器操作改为复用挂载时提供的 Monaco API，使生产代码中的 Monaco 运行时导入点由 14 个降至 7 个。
- 稳定标签、标签附件和拖拽导入回调，并隔离标签栏与性能面板的无关重绘。
- 将编辑、对比、诊断、关于和节点操作弹窗改为按需加载，使主程序包由约 277.2 kB 降至 221.0 kB，并加入独立体积门槛。
- 增加工作区组合、弹窗装载和状态操作稳定性测试，同时移除未接入界面的浮动面板代码。

### English

- Reworked the Chinese and English README landing sections around large files, local processing, cross-platform downloads, and a 30-second quick start.
- Added bilingual animated demos assembled from real Electron screenshots and a Social Preview image for GitHub link cards.
- Added a reproducible animated-demo generator and connected it to the documentation screenshot workflow.
- Expanded the full Electron E2E suite to Linux, macOS, and Windows, with a 20MB scenario on every release target before packaging.
- Included every renderer source file in the coverage baseline and added focused branch coverage for content actions and worker edits.
- Pinned production security audits to the official npm endpoint and added Dependabot minor/patch maintenance targeting `dev`.
- Reduced temporary string allocations during native Electron imports while tolerating files that change size during reading.
- Fixed byte-large, low-line-count JSON bypassing the virtual viewer and stale structure work potentially publishing results.
- Added regression tests and coverage gates for format workers, tab state, and dual-pane search orchestration.
- Gently softened the default theme while preserving its original green character across light and dark interaction states.
- Unified toolbar checkbox sizing and baselines across checked and unchecked states to avoid native macOS and Windows rendering drift.
- Gave the fixed new-tab plus a subtle visual emphasis while retaining bilingual tooltips.
- Made JSON escape and unescape preserve original whitespace, indentation, and line breaks instead of reformatting the left pane during a round trip.
- Matched large raw-viewer syntax colors and logical line numbers to the regular editor, while using transferable buffers to preserve 20MB escape round trips exactly.
- Sped up repeated 20MB escapes by skipping redundant reparsing and deferring right-viewer builds that a subsequent transform can supersede.
- Reused worker text and semantically equivalent formatted results across consecutive large transforms; deeper escapes now synchronize through a chunked virtual viewer, while native streams paint progress before file reading starts.
- Removed duplicate full-text measurement and syntax scans from the format critical path, reused one encoded result, and added result-ready time to the 5MB/20MB regression gate.
- Passed native Electron import buffers directly to the formatting worker, avoiding a second UTF-8 encoding of 20MB text in the renderer.
- Released pending large-file results and format watchdogs immediately when tabs are cleared or closed, preventing abandoned large-text references.
- Bounded worker-side large-viewer caches to the two most recent tabs and transparently restored search and locate data when revisiting an evicted tab.
- Automatically rebuilt the worker after load or message failures and safely retried unfinished format requests.
- Moved tab-specific processing and large-file guidance below the tab bar so switching document types no longer shifts tab positions vertically.
- Preserved right-viewer and search caches when large-file locating is disabled, while rebuilding only the locate index when it is enabled again.
- Safely resumed unfinished search, locate, and edit requests after worker restarts while continuing to ignore late results from obsolete workers.
- Added Electron cold-start budgets and two-cycle large-file multi-tab memory regression checks for startup slowdowns and cumulative leaks.
- Kept the new-tab action beside fitting tabs and visible during overflow, with keyboard and blank-tab-bar double-click creation shortcuts.
- Stabilized search, performance tracking, editor synchronization, and worker lifecycle callbacks to eliminate Hook dependency warnings and avoid repeated effects.
- Added orchestration coverage for drag-and-drop imports, performance sessions, and editor model synchronization, including invalid files and updated callbacks.
- Reused Monaco APIs supplied during editor mounting for search and editor actions, reducing production Monaco runtime import sites from 14 to 7.
- Stabilized tab, tab-artifact, and drag-import callbacks while isolating the tab bar and performance panel from unrelated renders.
- Lazy-loaded edit, compare, diagnostics, about, and node-action dialogs, reducing the main App bundle from about 277.2 kB to 221.0 kB and adding a dedicated size budget.
- Added workspace composition, dialog mounting, and state-action stability tests while removing unused floating-panel code that was never connected to the interface.

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
