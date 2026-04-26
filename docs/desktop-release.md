# Desktop Release

## Local Package

Build on the same platform as the target whenever possible.

```bash
npm ci
npm test
npm run dist:mac
```

The macOS files are written to `release/`.

```powershell
npm ci
npm test
npm run dist:win
```

The Windows files are written to `release/`.

## GitHub Release

The workflow in `.github/workflows/desktop-release.yml` packages macOS and Windows builds when a version tag is pushed.

```bash
git checkout dev-codex
git pull origin dev-codex
git tag -a v1.0.6-dev-codex -m "HanJson desktop release v1.0.6-dev-codex"
git push origin v1.0.6-dev-codex
```

After the workflow finishes, open the GitHub repository and go to **Releases**. The generated `.dmg`, `.exe`, and `.zip` files will be attached to that release.

## Notes

- The current release artifacts are unsigned. macOS Gatekeeper and Windows SmartScreen may warn users on first install.
- For public distribution, use Apple Developer ID signing and notarization for macOS, and a code-signing certificate for Windows.
- The public product name is configured by `build.productName` in `package.json`.
