# HanJson Validation Checklist

Use this checklist after routine changes and before handing a build to someone else. The commands below work from the repository root.

## 1. Daily Regression

```bash
npm run check
```

Expected result:

- Renderer and Electron type checks pass.
- Vitest passes.
- Production build completes.
- No Vite deprecation, sourcemap, or oversized chunk warnings are introduced.

## 2. Large JSON Samples

```bash
npm run samples
npm run bench -- --samples
```

Expected result:

- Local ignored files are created in `json/`.
- Default samples include `sample-5mb.json`, `sample-6mb.json`, `sample-7mb.json`, `sample-10mb.json`, `sample-15mb.json`, and `sample-20mb.json`.
- Bench output completes without crashes.
- Parse, stringify, viewer-index, and tree timings do not show obvious regressions against recent local baselines.

## 3. Manual Desktop Smoke Test

```bash
npm run dev
```

Use the desktop app window opened by Electron, not a browser-based JSON formatter.

Manual flow:

1. Import `json/sample-5mb.json`.
2. Confirm the right pane enters large-file viewer mode.
3. Fold and unfold nodes from the toolbar and from row-level fold controls.
4. Open right-pane search with `Cmd/Ctrl+F`, search for `HanJson`, then navigate next and previous matches.
5. Right-click a value in the large viewer and choose `Copy value`; paste it into a new tab and confirm it remains valid JSON.
6. Enable `大文件启用右侧定位`, click content in the right pane, and confirm the left pane locates the corresponding raw JSON value.
7. Repeat import smoke checks with `sample-10mb.json` and `sample-20mb.json`.
8. Create a second tab, import another sample, switch tabs, and confirm content, fold state, and search state stay stable.
9. Toggle dark mode, long-line wrapping, and the performance panel.

Expected result:

- 5MB and larger JSON files use the dedicated large-file viewer.
- Search, fold/unfold, copy value, optional locate, tab switching, and performance panel interactions remain stable.

## 4. Release Candidate Check

Run this before creating a release branch, version tag, or distributable package:

```bash
npm run check
npm run samples
npm run bench -- --samples
```

Then run the full manual desktop smoke test above.

## 5. Notes

- Automated tests reduce repeated manual work, but they do not fully replace opening the Electron desktop app.
- The most important manual path is still: import 5MB+ JSON, fold, search, copy value, locate left, switch tabs, and return.
- `json/`, `dist-renderer/`, `dist-electron/`, and `release/` are local/generated artifacts and should stay out of git.
