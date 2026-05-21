# Contributing

Thanks for helping improve FxxkJson.

## Local Setup

```bash
npm install
npm run dev
```

## Before Opening a Pull Request

Run the focused checks for your change, then run the project checks before asking for review:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run smoke
npm run build
```

For performance-sensitive changes, also run:

```bash
npm run perf:regression
```

## Pull Request Guidelines

- Create a short-lived branch from `main` for feature, fix, refactor, and release-prep work.
- Keep `main` releasable. Merge reviewed changes back through a pull request after checks pass.
- Keep changes focused and describe the user-visible behavior.
- Add or update tests when behavior changes.
- Do not commit generated artifacts from `dist-renderer/`, `dist-electron/`, `release/`, `json/`, or local logs.
- Do not include private JSON data, credentials, certificates, or screenshots containing secrets.

## Release Process

Releases are cut from version tags on `main`. See [docs/desktop-release.md](docs/desktop-release.md).
