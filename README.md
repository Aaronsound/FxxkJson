# FxxkJson

FxxkJson is a desktop JSON formatter, repair tool, search workspace, comparer, and large-file inspector built with Electron, React, Vite, and Monaco Editor.

The app is designed for local-first JSON work: paste or import JSON on the left, inspect formatted output on the right, search and edit nodes, compare documents, and keep large files responsive with a virtualized viewer.

## Features

- Format, repair, escape, unescape, edit, and compare JSON locally.
- Multi-tab workspace with per-tab editor, search, fold, and selection state.
- Left-pane search and replace plus right-pane formatted-result search.
- Dedicated large-file viewer for 5MB+ JSON with virtualized rows, fold/unfold, copy, edit, delete, rename, and optional right-to-left locate.
- Worker-based formatting, search, node editing, and large-file indexing to keep the UI responsive.
- Performance panel, diagnostics log panel, light/dark mode, and long-line wrapping.
- Electron desktop packaging for macOS and Windows.

## Privacy

FxxkJson processes JSON locally in the desktop app. The project does not include analytics, telemetry uploads, or remote JSON processing.

## Requirements

- Node.js 22+
- npm

## Development

```bash
npm install
npm run dev        # run the Electron + Vite dev app
npm run format:check # verify repository formatting
npm run lint       # run Biome lint checks
npm run typecheck  # type-check renderer and Electron sources
npm test           # run Vitest tests
npm run build      # build renderer and Electron output
npm run check      # formatting + lint + typecheck + test + smoke + build
npm start          # run the built desktop app after npm run build
```

Packaging commands:

```bash
npm run dist:mac
npm run dist:win
npm run dist
```

Generated installers are written to `release/`.

## Electron Download Mirror

The repository no longer forces an npm mirror through `.npmrc`. If Electron binary download is slow or interrupted, either run:

```bash
npm run setup:electron
```

or set a mirror for one install:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

## Large JSON Notes

- Files at or above `5MB` enter large-file mode.
- Formatted output at or above `5MB` uses the dedicated readonly viewer instead of a second Monaco model.
- Optional right-to-left locate is available for large files, with expensive structure trees deferred until locate/copy/edit behavior needs them.
- Generated samples live in `json/`; that directory is intentionally ignored by git.
- `npm run smoke` exercises a lightweight core flow without opening the desktop UI.
- `npm run perf:regression` measures local 5MB/20MB sample performance and can compare against a committed baseline.

## Release Notes

The desktop release workflow builds unsigned macOS and Windows packages from version tags. Public distribution may show macOS Gatekeeper or Windows SmartScreen warnings until code signing and notarization are configured.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
