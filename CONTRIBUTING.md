# Contributing / 贡献指南

Thanks for helping improve FxxkJson.  
感谢你帮助改进 FxxkJson。

## Local Setup / 本地启动

```bash
npm install
npm run dev
```

## Before Opening a Pull Request / 提交 PR 前

Run focused checks for your change, then run the project checks before asking for review.  
请先运行和改动相关的检查，再运行项目级检查。

```bash
npm run typecheck
npm test
npm run smoke
npm run build
```

For performance-sensitive changes, also run:

```bash
npm run perf:regression
```

如果改动涉及大 JSON、搜索、定位、虚拟滚动或 worker 性能，请额外运行性能回归检查。

## Pull Request Guidelines / PR 建议

- Keep changes focused and describe the user-visible behavior.
- Add or update tests when behavior changes.
- Do not commit generated artifacts from `dist-renderer/`, `dist-electron/`, `release/`, `json/`, or local logs.
- Do not include private JSON data, credentials, certificates, or screenshots containing secrets.
- 请保持改动聚焦，并说明用户可感知的变化。
- 行为变化需要补充或更新测试。
- 不要提交构建产物、本地样本、日志或 release 输出。
- 不要在 PR、issue、截图或日志里公开私密 JSON、token、密钥或用户数据。

## Release Process / 发布流程

Releases are cut from version tags on `main`. See [docs/desktop-release.md](docs/desktop-release.md).  
发布由 `main` 上的版本 tag 触发，详见 [docs/desktop-release.md](docs/desktop-release.md)。
