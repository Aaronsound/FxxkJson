# GitHub Repository Settings

These settings are not stored in git. Configure them in the GitHub repository sidebar and settings pages.

## About

Suggested description:

```text
Local-first desktop JSON formatter, repair tool, comparer, and large-file inspector.
```

Suggested website:

```text
https://github.com/Aaronsound/FxxkJson/releases/latest
```

Suggested topics:

```text
json
json-formatter
json-repair
json-compare
electron
react
vite
monaco-editor
desktop-app
large-files
privacy
local-first
```

## Repository Features

Recommended enabled features:

- Issues
- Discussions, if you want user questions and usage sharing outside bug reports
- Releases
- Private vulnerability reporting, if available for the repository

## Branch Protection

Recommended `main` branch protection:

- Require pull request before merging
- Require CI to pass
- Require branches to be up to date before merging
- Restrict force pushes on `main`

The project recently rewrote release history during the open-source rename. After the public release settles, disabling force pushes on `main` will make future tags and releases easier to reason about.
