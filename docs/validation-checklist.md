# HanJson Validation Checklist

## 1. Daily Regression

Use this checklist after routine code changes.

### Step 1: Build

```powershell
cd "C:\Users\Alosan\Documents\New project"
npm.cmd run build
```

Expected result:
- Build completes successfully
- No new TypeScript or Vite build errors

### Step 2: Run Automated Smoke Tests

```powershell
cd "C:\Users\Alosan\Documents\New project"
npm.cmd run test
```

Expected result:
- All tests pass
- Current smoke coverage includes:
  - generated line-threshold sample stays on the Monaco path
  - generated high-line sample enters the large-file viewer path
  - large-file viewer search
  - fold all / unfold all
  - click-to-locate-left
  - copy value

### Step 3: Generate Manual Samples

```powershell
cd "C:\Users\Alosan\Documents\New project"
npm.cmd run samples
```

Expected result:
- Creates local ignored files in `json/`
- Default files are `sample-5mb.json`, `sample-10mb.json`, `sample-15mb.json`, and `sample-20mb.json`

### Step 4: Quick Manual Check

```powershell
cd "C:\Users\Alosan\Documents\New project"
npm.cmd run dev
```

Use these sample files in `json/`:
- `sample-5mb.json`
- `sample-10mb.json`
- `sample-15mb.json`
- `sample-20mb.json`

Manual flow:
1. Import `sample-5mb.json`
2. Confirm the right pane enters large-file viewer mode and supports fold / unfold arrows
3. Import `sample-6mb.json`, `sample-7mb.json`, and `sample-10mb.json`
4. Confirm the right pane keeps the same large-file viewer layout and controls
5. Fold one object or array in the right pane
6. Search for a known key or value and use `上一项 / 下一项`
7. Right-click a value and use `复制值`
8. Click a node or matched content on the right and confirm the left pane locates correctly

Expected result:
- 5MB and larger JSON files use the same dedicated large-file viewer path
- Search, fold, copy, and locate all still work

## 2. Release Candidate Check

Use this checklist before pushing a release branch, creating a tag, or asking for final acceptance.

### Commands

```powershell
cd "C:\Users\Alosan\Documents\New project"
npm.cmd run build
npm.cmd run test
npm.cmd run samples
npm.cmd run bench -- .\json\sample-5mb.json
npm.cmd run bench -- .\json\sample-10mb.json
npm.cmd run bench -- .\json\sample-15mb.json
npm.cmd run bench -- .\json\sample-20mb.json
```

Expected result:
- Build passes
- Tests pass
- Bench output completes without crashing
- No obvious performance regression compared with recent baselines

### Manual Release Flow

1. Start the app with `npm.cmd run dev`
2. Import `sample-5mb.json`
3. Import `sample-10mb.json`
4. Import `sample-20mb.json`
5. For each file, confirm:
   - left pane displays raw JSON
   - right pane displays formatted output
   - fold / unfold still works
   - search still works
   - right-side click can still locate left side when the feature is enabled
6. Create a second tab, import another sample, and switch back and forth
7. Confirm fold state and content state stay stable after tab switching
8. Copy a value from the right pane, open a new tab, paste it into the left pane, and confirm it remains valid JSON
9. Toggle full screen and restore window size
10. Confirm the toolbar, tab titles, and performance panel still render correctly

## 3. When To Run Which Checklist

- Small UI or wording change:
  - Run `build`
  - Run `test`

- Logic change in formatting, tabs, search, copy, locate, or large-file viewer:
  - Run the full `Daily Regression`

- Before tagging or pushing a stable milestone:
  - Run the full `Release Candidate Check`

## 4. Notes

- Automated tests reduce repeated manual work, but they do not fully replace opening the app.
- The most important manual path is still:
  - import `5MB`, `6MB`, `7MB`, and `10MB`
  - fold
  - search
  - copy value
  - locate left
  - switch tabs and come back
