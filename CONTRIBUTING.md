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

- Keep changes focused and describe the user-visible behavior.
- Add or update tests when behavior changes.
- Do not commit generated artifacts from `dist-renderer/`, `dist-electron/`, `release/`, `json/`, or local logs.
- Do not include private JSON data, credentials, certificates, or screenshots containing secrets.

## Release Process

Releases are cut from version tags on `main`. See [docs/desktop-release.md](docs/desktop-release.md).
